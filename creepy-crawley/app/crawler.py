from __future__ import annotations

import asyncio
import hashlib
import ipaddress
import os
import socket
import time
import xml.etree.ElementTree as ET
from collections import OrderedDict
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse, urlunparse

import httpx
import trafilatura
from pypdf import PdfReader
from io import BytesIO

MAX_PAGE_BYTES = 2_000_000
MAX_TEXT_CHARS = 20_000
MAX_REDIRECTS = 4
FETCH_TIMEOUT = 8.0
USER_AGENT = "NallyCreepyCrawley/0.4 (+bounded page extraction)"
CACHE_TTL_SECONDS = 300
CACHE_MAX_ITEMS = 128
_cache: OrderedDict[str, tuple[float, dict]] = OrderedDict()
_cache_lock = asyncio.Lock()
_metrics = {"fetches": 0, "cache_hits": 0, "fetch_errors": 0, "pages_crawled": 0, "pdfs_extracted": 0}


def metrics_snapshot() -> dict:
    return {**_metrics, "cache_items": len(_cache)}


class PageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.title_parts: list[str] = []
        self.links: list[str] = []
        self.headings: list[str] = []
        self.tables: list[str] = []
        self.meta: dict[str, str] = {}
        self.in_title = False
        self.heading_level = 0
        self.in_cell = False
        self.current_cell: list[str] = []
        self.current_row: list[str] = []
        self.current_table: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attrs_map = dict(attrs)
        tag = tag.lower()
        if tag == "title":
            self.in_title = True
        if tag == "a" and attrs_map.get("href"):
            self.links.append(attrs_map["href"] or "")
        if tag == "meta":
            key = (attrs_map.get("name") or attrs_map.get("property") or "").lower()
            value = attrs_map.get("content") or ""
            if key and value:
                self.meta[key] = value
        if tag in {"h1", "h2", "h3"}:
            self.heading_level = int(tag[1])
            self._heading_buffer = []
        if tag in {"td", "th"}:
            self.in_cell = True
            self.current_cell = []

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag == "title":
            self.in_title = False
        if tag in {"h1", "h2", "h3"} and self.heading_level:
            heading = " ".join(getattr(self, "_heading_buffer", [])).strip()
            if heading:
                self.headings.append(heading)
            self.heading_level = 0
        if tag in {"td", "th"} and self.in_cell:
            self.current_row.append(" ".join(self.current_cell).strip())
            self.in_cell = False
        if tag == "tr" and self.current_row:
            self.current_table.append(" | ".join(self.current_row))
            self.current_row = []
        if tag == "table" and self.current_table:
            self.tables.append("\\n".join(self.current_table))
            self.current_table = []

    def handle_data(self, data: str) -> None:
        value = data.strip()
        if not value:
            return
        if self.in_title:
            self.title_parts.append(value)
        if self.heading_level:
            self._heading_buffer.append(value)
        if self.in_cell:
            self.current_cell.append(value)


def normalize_url(url: str) -> str | None:
    try:
        parsed = urlparse(url)
        if parsed.scheme not in {"http", "https"} or not parsed.hostname:
            return None
        if parsed.username or parsed.password:
            return None
        port = parsed.port or (443 if parsed.scheme == "https" else 80)
        if port not in {80, 443}:
            return None
        host = parsed.hostname.lower().rstrip(".")
        return urlunparse((parsed.scheme.lower(), host, parsed.path or "/", parsed.params, parsed.query, ""))
    except ValueError:
        return None


def canonical_url(url: str) -> str:
    normalized = normalize_url(url) or url
    parsed = urlparse(normalized)
    return urlunparse((parsed.scheme, parsed.netloc, parsed.path.rstrip("/") or "/", "", parsed.query, ""))


def domain_allowed(url: str, allow_domains: list[str] | None = None, deny_domains: list[str] | None = None) -> bool:
    host = (urlparse(url).hostname or "").lower().rstrip(".")
    def matches(domain: str) -> bool:
        candidate = domain.lower().strip().lstrip(".").rstrip(".")
        return bool(candidate) and (host == candidate or host.endswith("." + candidate))
    if allow_domains and not any(matches(domain) for domain in allow_domains):
        return False
    if deny_domains and any(matches(domain) for domain in deny_domains):
        return False
    return True


async def is_public_url(url: str) -> bool:
    normalized = normalize_url(url)
    if not normalized:
        return False
    parsed = urlparse(normalized)
    try:
        try:
            addresses = [ipaddress.ip_address(parsed.hostname or "")]
        except ValueError:
            records = await asyncio.to_thread(
                socket.getaddrinfo, parsed.hostname, parsed.port or (443 if parsed.scheme == "https" else 80),
                type=socket.SOCK_STREAM,
            )
            addresses = list({ipaddress.ip_address(record[4][0]) for record in records})
        return bool(addresses) and all(address.is_global for address in addresses)
    except (OSError, ValueError):
        return False


async def _cached(url: str) -> dict | None:
    async with _cache_lock:
        entry = _cache.get(canonical_url(url))
        if not entry:
            return None
        expires, value = entry
        if expires <= time.monotonic():
            _cache.pop(canonical_url(url), None)
            return None
        _cache.move_to_end(canonical_url(url))
        _metrics["cache_hits"] += 1
        return dict(value)


async def _store(url: str, value: dict) -> None:
    async with _cache_lock:
        key = canonical_url(url)
        _cache[key] = (time.monotonic() + CACHE_TTL_SECONDS, dict(value))
        _cache.move_to_end(key)
        while len(_cache) > CACHE_MAX_ITEMS:
            _cache.popitem(last=False)


def _extract_pdf(data: bytes) -> tuple[str, dict]:
    reader = PdfReader(BytesIO(data), strict=False)
    chunks = [(page.extract_text() or "").strip() for page in reader.pages[:100]]
    text = "\\n\\n".join(chunk for chunk in chunks if chunk)
    metadata = reader.metadata
    structured = {
        "author": str(metadata.author) if metadata and metadata.author else None,
        "published_date": str(metadata.creation_date) if metadata and metadata.creation_date else None,
        "page_count": len(reader.pages),
        "headings": [],
        "tables": [],
        "links": [],
        "content_type": "application/pdf",
    }
    return text[:MAX_TEXT_CHARS], {**structured, "content_truncated": len(text) > MAX_TEXT_CHARS}


async def _render_javascript(client: httpx.AsyncClient, url: str) -> bytes | None:
    renderer = os.getenv("JS_RENDER_URL", "").strip()
    if not renderer:
        return None
    headers = {"Content-Type": "application/json"}
    token = os.getenv("JS_RENDER_TOKEN", "").strip()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    try:
        response = await client.post(renderer, json={"url": url, "wait_until": "networkidle"}, headers=headers, timeout=FETCH_TIMEOUT)
        response.raise_for_status()
        payload = response.json()
        html = payload.get("html")
        return html.encode("utf-8") if isinstance(html, str) else None
    except (httpx.HTTPError, ValueError):
        return None


async def fetch_document(client: httpx.AsyncClient, url: str, use_cache: bool = True) -> dict:
    normalized = normalize_url(url)
    if not normalized or not await is_public_url(normalized):
        raise ValueError("URL is not a permitted public HTTP(S) destination")
    if use_cache:
        cached = await _cached(normalized)
        if cached:
            return cached

    current = normalized
    for redirect_count in range(MAX_REDIRECTS + 1):
        if not await is_public_url(current):
            raise ValueError("Redirect destination is not a permitted public URL")
        _metrics["fetches"] += 1
        async with client.stream("GET", current, headers={"Accept": "text/html,application/xhtml+xml,application/pdf;q=0.9"}) as response:
            if response.status_code in {301, 302, 303, 307, 308}:
                location = response.headers.get("location")
                if not location or redirect_count >= MAX_REDIRECTS:
                    raise ValueError("Redirect limit exceeded")
                current = urljoin(current, location)
                continue
            response.raise_for_status()
            content_type = response.headers.get("content-type", "").lower()
            chunks: list[bytes] = []
            size = 0
            async for chunk in response.aiter_bytes():
                size += len(chunk)
                if size > MAX_PAGE_BYTES:
                    raise ValueError("Page exceeds the 2 MB fetch limit")
                chunks.append(chunk)
            data = b"".join(chunks)

            if "application/pdf" in content_type or current.lower().endswith(".pdf"):
                text, structured = _extract_pdf(data)
                _metrics["pdfs_extracted"] += 1
                result = {"title": current.rsplit("/", 1)[-1] or "PDF document", "url": current, "content": text,
                          "content_truncated": structured["content_truncated"], "structured": structured,
                          "links": [], "status": "ok"}
                await _store(normalized, result)
                return result

            if "text/html" not in content_type and "application/xhtml+xml" not in content_type:
                raise ValueError("URL did not return HTML or PDF content")
            html = data.decode(response.encoding or "utf-8", errors="replace")
            parser = PageParser()
            parser.feed(html)
            text = trafilatura.extract(html, url=current, include_comments=False, include_tables=True, favor_precision=True) or ""

            # Optional JavaScript renderer: configured externally, so no browser
            # process or extra Render service is required in this container.
            if len(text.strip()) < 160 and os.getenv("JS_RENDER_URL", "").strip():
                rendered = await _render_javascript(client, current)
                if rendered:
                    rendered_html = rendered[:MAX_PAGE_BYTES].decode("utf-8", errors="replace")
                    rendered_text = trafilatura.extract(rendered_html, url=current, include_comments=False, include_tables=True, favor_precision=True) or ""
                    if len(rendered_text) > len(text):
                        html, text = rendered_html, rendered_text
                        parser = PageParser()
                        parser.feed(html)

            metadata = trafilatura.extract_metadata(html, default_url=current)
            structured = {
                "author": getattr(metadata, "author", None) if metadata else parser.meta.get("author"),
                "published_date": getattr(metadata, "date", None) if metadata else parser.meta.get("article:published_time"),
                "description": parser.meta.get("description") or parser.meta.get("og:description"),
                "headings": parser.headings[:100],
                "tables": parser.tables[:20],
                "links": [urljoin(current, href) for href in parser.links[:200]],
                "content_type": "text/html",
            }
            result = {
                "title": " ".join(parser.title_parts).strip() or (getattr(metadata, "title", None) if metadata else None) or current,
                "url": current,
                "content": text[:MAX_TEXT_CHARS].strip(),
                "content_truncated": len(text) > MAX_TEXT_CHARS,
                "structured": structured,
                "links": structured["links"],
                "status": "ok",
            }
            await _store(normalized, result)
            return result
    raise ValueError("Redirect limit exceeded")


async def scrape_url(url: str) -> dict:
    timeout = httpx.Timeout(FETCH_TIMEOUT, connect=3.0)
    limits = httpx.Limits(max_connections=2, max_keepalive_connections=1)
    async with httpx.AsyncClient(timeout=timeout, limits=limits, follow_redirects=False, headers={"User-Agent": USER_AGENT}) as client:
        return await fetch_document(client, url)


async def discover_sitemap_urls(client: httpx.AsyncClient, base_url: str, max_urls: int = 100) -> list[str]:
    parsed = urlparse(base_url)
    candidates = [urljoin(base_url, "/sitemap.xml"), urljoin(base_url, "/sitemap_index.xml")]
    robots = urljoin(base_url, "/robots.txt")
    try:
        response = await client.get(robots)
        if response.status_code == 200:
            for line in response.text.splitlines():
                if line.lower().startswith("sitemap:"):
                    candidates.insert(0, line.split(":", 1)[1].strip())
    except httpx.HTTPError:
        pass
    urls: list[str] = []
    visited_maps: set[str] = set()
    while candidates and len(urls) < max_urls:
        sitemap = candidates.pop(0)
        normalized = normalize_url(sitemap)
        if not normalized or (urlparse(normalized).hostname or "").lower() != (parsed.hostname or "").lower() or normalized in visited_maps:
            continue
        visited_maps.add(normalized)
        if not await is_public_url(normalized):
            continue
        try:
            response = await client.get(normalized, headers={"Accept": "application/xml,text/xml"})
            response.raise_for_status()
            root = ET.fromstring(response.content[:MAX_PAGE_BYTES])
            for node in root.iter():
                if node.tag.rsplit("}", 1)[-1] == "loc" and node.text:
                    target = normalize_url(node.text.strip())
                    if not target or (urlparse(target).hostname or "").lower() != (parsed.hostname or "").lower():
                        continue
                    if root.tag.rsplit("}", 1)[-1] == "sitemapindex":
                        candidates.append(target)
                    elif target not in urls:
                        urls.append(target)
                        if len(urls) >= max_urls:
                            break
        except (httpx.HTTPError, ET.ParseError, ValueError):
            continue
    return urls[:max_urls]


async def crawl_site(
    start_url: str,
    max_pages: int = 5,
    max_depth: int = 1,
    allow_domains: list[str] | None = None,
    deny_domains: list[str] | None = None,
    use_sitemap: bool = True,
) -> list[dict]:
    start = normalize_url(start_url)
    if not start or not await is_public_url(start):
        raise ValueError("Start URL must be a permitted public HTTP(S) URL on standard ports")
    if not domain_allowed(start, allow_domains, deny_domains):
        raise ValueError("Start URL is excluded by domain controls")
    start_host = (urlparse(start).hostname or "").lower()
    timeout = httpx.Timeout(FETCH_TIMEOUT, connect=3.0)
    limits = httpx.Limits(max_connections=2, max_keepalive_connections=1)
    queue: list[tuple[str, int]] = [(start, 0)]
    seen: set[str] = set()
    pages: list[dict] = []
    async with httpx.AsyncClient(timeout=timeout, limits=limits, follow_redirects=False, headers={"User-Agent": USER_AGENT}) as client:
        if use_sitemap:
            for sitemap_url in await discover_sitemap_urls(client, start, max_urls=max_pages * 5):
                if sitemap_url != start:
                    queue.append((sitemap_url, 1))
        while queue and len(pages) < max_pages:
            url, depth = queue.pop(0)
            normalized = normalize_url(url)
            if not normalized:
                continue
            key = canonical_url(normalized)
            if key in seen:
                continue
            if (urlparse(normalized).hostname or "").lower() != start_host or not domain_allowed(normalized, allow_domains, deny_domains):
                continue
            seen.add(key)
            try:
                page = await fetch_document(client, normalized)
                if (urlparse(page["url"]).hostname or "").lower() != start_host:
                    raise ValueError("Crawl redirects must remain on the starting host")
                links = page.pop("links", [])
                page["depth"] = depth
                page["links_found"] = len(links)
                pages.append(page)
                _metrics["pages_crawled"] += 1
                if depth < max_depth:
                    for href in links:
                        candidate = normalize_url(href)
                        if candidate and (urlparse(candidate).hostname or "").lower() == start_host and domain_allowed(candidate, allow_domains, deny_domains) and canonical_url(candidate) not in seen:
                            queue.append((candidate, depth + 1))
            except (httpx.HTTPError, ValueError, UnicodeError) as exc:
                _metrics["fetch_errors"] += 1
                pages.append({"url": normalized, "depth": depth, "status": "error", "error": str(exc)[:240]})
    return pages
