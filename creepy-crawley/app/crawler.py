from __future__ import annotations

import asyncio
import ipaddress
import socket
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse, urlunparse

import httpx
import trafilatura

MAX_PAGE_BYTES = 2_000_000
MAX_TEXT_CHARS = 20_000
MAX_REDIRECTS = 4
FETCH_TIMEOUT = 8.0
USER_AGENT = "NallyCreepyCrawley/0.3 (+bounded page extraction)"


class PageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.title_parts: list[str] = []
        self.links: list[str] = []
        self.in_title = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attrs_map = dict(attrs)
        if tag.lower() == "title":
            self.in_title = True
        if tag.lower() == "a" and attrs_map.get("href"):
            self.links.append(attrs_map["href"] or "")

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() == "title":
            self.in_title = False

    def handle_data(self, data: str) -> None:
        if self.in_title and data.strip():
            self.title_parts.append(data.strip())


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
        return urlunparse((parsed.scheme.lower(), parsed.netloc.lower(), parsed.path or "/", parsed.params, parsed.query, ""))
    except ValueError:
        return None


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


async def fetch_document(client: httpx.AsyncClient, url: str) -> dict:
    current = url
    for redirect_count in range(MAX_REDIRECTS + 1):
        normalized = normalize_url(current)
        if not normalized or not await is_public_url(normalized):
            raise ValueError("URL is not a permitted public HTTP(S) destination")
        async with client.stream("GET", normalized, headers={"Accept": "text/html,application/xhtml+xml;q=0.9"}) as response:
            if response.status_code in {301, 302, 303, 307, 308}:
                location = response.headers.get("location")
                if not location or redirect_count >= MAX_REDIRECTS:
                    raise ValueError("Redirect limit exceeded")
                current = urljoin(normalized, location)
                continue
            response.raise_for_status()
            content_type = response.headers.get("content-type", "").lower()
            if "text/html" not in content_type and "application/xhtml+xml" not in content_type:
                raise ValueError("URL did not return an HTML page")
            chunks: list[bytes] = []
            size = 0
            async for chunk in response.aiter_bytes():
                size += len(chunk)
                if size > MAX_PAGE_BYTES:
                    raise ValueError("Page exceeds the 2 MB fetch limit")
                chunks.append(chunk)
            html = b"".join(chunks).decode(response.encoding or "utf-8", errors="replace")
            parser = PageParser()
            parser.feed(html)
            text = trafilatura.extract(
                html, url=normalized, include_comments=False, include_tables=True, favor_precision=True
            ) or ""
            return {
                "title": " ".join(parser.title_parts).strip(),
                "url": normalized,
                "content": text[:MAX_TEXT_CHARS].strip(),
                "content_truncated": len(text) > MAX_TEXT_CHARS,
                "links": [urljoin(normalized, href) for href in parser.links],
            }
    raise ValueError("Redirect limit exceeded")


async def scrape_url(url: str) -> dict:
    timeout = httpx.Timeout(FETCH_TIMEOUT, connect=3.0)
    limits = httpx.Limits(max_connections=2, max_keepalive_connections=1)
    async with httpx.AsyncClient(timeout=timeout, limits=limits, follow_redirects=False, headers={"User-Agent": USER_AGENT}) as client:
        return await fetch_document(client, url)


async def crawl_site(start_url: str, max_pages: int = 5, max_depth: int = 1) -> list[dict]:
    start = normalize_url(start_url)
    if not start:
        raise ValueError("Start URL must be a public HTTP(S) URL on the standard web ports")
    start_host = (urlparse(start).hostname or "").lower()
    timeout = httpx.Timeout(FETCH_TIMEOUT, connect=3.0)
    limits = httpx.Limits(max_connections=2, max_keepalive_connections=1)
    queue: list[tuple[str, int]] = [(start, 0)]
    seen: set[str] = set()
    pages: list[dict] = []
    async with httpx.AsyncClient(timeout=timeout, limits=limits, follow_redirects=False, headers={"User-Agent": USER_AGENT}) as client:
        while queue and len(pages) < max_pages:
            url, depth = queue.pop(0)
            normalized = normalize_url(url)
            if not normalized or normalized in seen:
                continue
            if (urlparse(normalized).hostname or "").lower() != start_host:
                continue
            seen.add(normalized)
            try:
                page = await fetch_document(client, normalized)
                if (urlparse(page["url"]).hostname or "").lower() != start_host:
                    raise ValueError("Crawl redirects must remain on the starting host")
                page_links = page.pop("links")
                page["depth"] = depth
                page["links_found"] = len(page_links)
                pages.append(page)
                if depth < max_depth:
                    for href in page_links:
                        candidate = normalize_url(href)
                        if candidate and (urlparse(candidate).hostname or "").lower() == start_host and candidate not in seen:
                            queue.append((candidate, depth + 1))
            except (httpx.HTTPError, ValueError, UnicodeError) as exc:
                pages.append({"url": normalized, "depth": depth, "status": "error", "error": str(exc)[:240]})
    return pages
