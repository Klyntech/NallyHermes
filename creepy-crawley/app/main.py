from __future__ import annotations

import asyncio
import ipaddress
import logging
import re
import secrets
import socket
import time
from typing import Literal
from urllib.parse import urljoin, urlparse

import httpx
import trafilatura
from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field, HttpUrl

from .config import get_settings
from .crawler import canonical_url, crawl_site, metrics_snapshot, scrape_url

logger = logging.getLogger(__name__)
bearer_scheme = HTTPBearer(auto_error=False)

app = FastAPI(
    title="Nally Creepy Crawley",
    description="Private, self-hosted search, scraping, and bounded site crawling API backed by SearXNG.",
    version="0.3.0",
)

MAX_PAGE_BYTES = 2_000_000
MAX_EXTRACTED_CHARS = 12_000
MAX_REDIRECTS = 4
PAGE_FETCH_TIMEOUT = 8.0
PAGE_FETCH_CONCURRENCY = 4


class ScrapeRequest(BaseModel):
    url: HttpUrl


class CrawlRequest(BaseModel):
    url: HttpUrl
    max_pages: int = Field(default=5, ge=1, le=20)
    max_depth: int = Field(default=1, ge=0, le=2)


class SearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=500)
    max_results: int = Field(default=10, ge=1, le=100)
    topic: Literal["general", "news"] = "general"
    include_domains: list[str] = Field(default_factory=list)
    exclude_domains: list[str] = Field(default_factory=list)
    extract_content: bool = True
    max_content_results: int = Field(default=5, ge=0, le=10)
    max_context_chars: int = Field(default=18000, ge=1000, le=40000)
    context_per_source_chars: int = Field(default=4000, ge=500, le=8000)


class SearchResult(BaseModel):
    title: str
    url: HttpUrl
    content: str = ""
    extracted_content: str | None = None
    extraction_status: Literal["success", "unavailable", "skipped"] = "skipped"
    extracted_content_truncated: bool = False
    structured: dict = Field(default_factory=dict)
    score: float | None = None
    published_date: str | None = None
    rank: int | None = None
    score_origin: Literal["searxng"] = "searxng"
    relevance_status: Literal["relevant", "uncertain", "low_relevance"] = "uncertain"
    quality_flags: list[str] = Field(default_factory=list)
    published_date_source: Literal["source_reported"] = "source_reported"
    published_date_verified: bool = False


class ContextItem(BaseModel):
    source_index: int
    title: str
    url: HttpUrl
    text: str
    content_type: Literal["extracted", "snippet"]
    relevance_status: Literal["relevant", "uncertain", "low_relevance"] = "uncertain"
    quality_flags: list[str] = Field(default_factory=list)


class SourceItem(BaseModel):
    index: int
    title: str
    url: HttpUrl
    score: float | None = None
    published_date: str | None = None
    extraction_status: Literal["success", "unavailable", "skipped"]
    content_truncated: bool = False
    rank: int
    score_origin: Literal["searxng"] = "searxng"
    relevance_status: Literal["relevant", "uncertain", "low_relevance"] = "uncertain"
    quality_flags: list[str] = Field(default_factory=list)
    published_date_source: Literal["source_reported"] = "source_reported"
    published_date_verified: bool = False


class SearchResponse(BaseModel):
    query: str
    answer: str | None = None
    images: list = Field(default_factory=list)
    context: list[ContextItem] = Field(default_factory=list)
    sources: list[SourceItem] = Field(default_factory=list)
    results: list[SearchResult]
    response_time: float


def require_api_key(credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme)) -> None:
    expected = get_settings().api_key.strip()
    if not expected or expected == "change-me-to-a-long-random-secret":
        logger.error("API key auth unavailable: configured_key_present=%s", bool(expected))
        raise HTTPException(status_code=503, detail="API key is not configured. Set API_KEY before using the search endpoint.")

    supplied = credentials.credentials.strip() if credentials else ""
    matches = bool(supplied) and secrets.compare_digest(supplied, expected)
    if not matches:
        logger.warning(
            "API key auth failed: bearer_credential_present=%s credential_scheme=%s "
            "supplied_length=%d configured_key_present=%s expected_length=%d",
            bool(supplied),
            credentials.scheme if credentials else "missing",
            len(supplied),
            bool(expected),
            len(expected),
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API key")


def domain_matches(host: str, domains: list[str]) -> bool:
    host = host.lower().rstrip(".")
    return any(
        host == domain.lower().strip().lstrip(".")
        or host.endswith("." + domain.lower().strip().lstrip("."))
        for domain in domains
    )


async def validate_public_url(url: str) -> bool:
    """Reject local/private destinations before fetching search-result URLs."""
    try:
        parsed = urlparse(url)
        if parsed.scheme not in {"http", "https"} or not parsed.hostname:
            return False
        if parsed.username or parsed.password:
            return False
        port = parsed.port or (443 if parsed.scheme == "https" else 80)
        if port not in {80, 443}:
            return False

        host = parsed.hostname.rstrip(".")
        try:
            addresses = [ipaddress.ip_address(host)]
        except ValueError:
            records = await asyncio.to_thread(
                socket.getaddrinfo, host, port, type=socket.SOCK_STREAM
            )
            addresses = list({ipaddress.ip_address(record[4][0]) for record in records})
        return bool(addresses) and all(address.is_global for address in addresses)
    except (OSError, ValueError):
        return False


async def fetch_page_text(client: httpx.AsyncClient, url: str) -> tuple[str | None, bool]:
    current_url = url
    for redirect_count in range(MAX_REDIRECTS + 1):
        if not await validate_public_url(current_url):
            return None, False

        try:
            async with client.stream("GET", current_url, headers={"Accept": "text/html,application/xhtml+xml;q=0.9"}) as response:
                if response.status_code in {301, 302, 303, 307, 308}:
                    location = response.headers.get("location")
                    if not location or redirect_count >= MAX_REDIRECTS:
                        return None, False
                    current_url = urljoin(current_url, location)
                    continue
                response.raise_for_status()
                content_type = response.headers.get("content-type", "").lower()
                if "text/html" not in content_type and "application/xhtml+xml" not in content_type:
                    return None, False

                chunks: list[bytes] = []
                total = 0
                async for chunk in response.aiter_bytes():
                    total += len(chunk)
                    if total > MAX_PAGE_BYTES:
                        return None, False
                    chunks.append(chunk)
                html = b"".join(chunks).decode(response.encoding or "utf-8", errors="replace")
                extracted = trafilatura.extract(
                    html,
                    url=current_url,
                    include_comments=False,
                    include_tables=True,
                    favor_precision=True,
                )
                if not extracted:
                    return None, False
                return (extracted[:MAX_EXTRACTED_CHARS].strip() or None, len(extracted) > MAX_EXTRACTED_CHARS)
        except (httpx.HTTPError, UnicodeError, LookupError, ValueError):
            return None, False
    return None, False


async def enrich_result(
    result: SearchResult,
    client: httpx.AsyncClient,
    semaphore: asyncio.Semaphore,
) -> None:
    async with semaphore:
        try:
            page = await scrape_url(str(result.url))
            extracted = page.get("content") or ""
            truncated = bool(page.get("content_truncated"))
            result.structured = page.get("structured") or {}
        except (httpx.HTTPError, ValueError, UnicodeError):
            extracted, truncated = None, False
    if extracted:
        result.extracted_content = extracted
        result.extracted_content_truncated = truncated
        result.extraction_status = "success"
    else:
        result.extraction_status = "unavailable"



def assess_relevance(query: str, title: str, text: str) -> tuple[str, list[str]]:
    """Conservative passage-first lexical hints; not a confidence score."""
    stopwords = {"the", "and", "for", "with", "from", "that", "this", "how", "what", "when", "where", "why", "are", "was", "were", "does", "work"}
    tokenize = lambda value: {
        token.lower() for token in re.findall(r"[A-Za-z0-9][A-Za-z0-9'-]{2,}", value)
    }
    terms = tokenize(query) - stopwords
    title_hits = terms & tokenize(title)
    text_hits = terms & tokenize(text)
    if not terms:
        return "uncertain", ["query_has_no_discriminative_terms"]

    # Require meaningful overlap in the passage itself. A matching title alone
    # must never promote unrelated page text into the agent context.
    ratio = len(text_hits) / len(terms)
    sentences = [part for part in re.split(r"(?<=[.!?])\s+|\n+", text) if part.strip()]
    best_sentence_hits = max((len(terms & tokenize(sentence)) for sentence in sentences), default=0)
    minimum_hits = 1 if len(terms) == 1 else 2
    flags: list[str] = []
    if len(text.strip()) < 100:
        flags.append("short_content")
    if not text_hits:
        flags.append("title_only_match" if title_hits else "low_query_overlap")
        return "low_relevance", flags
    if len(text_hits) < minimum_hits or best_sentence_hits < minimum_hits:
        flags.append("weak_passage_overlap")
        if title_hits:
            flags.append("title_match_does_not_confirm_passage")
        return "low_relevance", flags
    if ratio < 0.5:
        flags.append("limited_query_overlap")
        return "uncertain", flags
    return "relevant", flags


def build_context(
    query: str,
    results: list[SearchResult],
    max_total_chars: int,
    per_source_chars: int,
) -> tuple[list[ContextItem], list[SourceItem]]:
    """Package source passages for downstream agents without generating an answer."""
    terms = {
        token.lower()
        for token in re.findall(r"[A-Za-z0-9][A-Za-z0-9'-]{2,}", query)
        if len(token) > 2
    }
    context: list[ContextItem] = []
    sources: list[SourceItem] = []
    remaining = max_total_chars

    for index, result in enumerate(results):
        candidate_text = result.extracted_content or result.content
        relevance, flags = assess_relevance(query, result.title, candidate_text)
        if len(candidate_text.strip()) < 100:
            flags.append("short_content")
        result.rank = index + 1
        result.relevance_status = relevance
        result.quality_flags = flags
        sources.append(SourceItem(
            index=index,
            title=result.title,
            url=result.url,
            score=result.score,
            published_date=result.published_date,
            extraction_status=result.extraction_status,
            content_truncated=result.extracted_content_truncated,
            rank=index + 1,
            score_origin="searxng",
            relevance_status=relevance,
            quality_flags=flags,
        ))
        if remaining <= 0:
            continue

        content_type = None
        source_text = result.extracted_content
        if source_text:
            content_type = "extracted"
        elif len(result.content.strip()) >= 100:
            snippet_terms = {
                token.lower() for token in re.findall(r"[A-Za-z0-9][A-Za-z0-9'-]{2,}", result.content)
            }
            if not terms or terms.intersection(snippet_terms):
                source_text = result.content
                content_type = "snippet"

        if not source_text or not content_type or relevance != "relevant":
            continue

        budget = min(per_source_chars, remaining)
        sentences = [part.strip() for part in re.split(r"(?<=[.!?])\s+|\n+", source_text) if part.strip()]
        if terms and sentences:
            ranked = sorted(
                enumerate(sentences),
                key=lambda pair: (
                    -len(terms.intersection({
                        token.lower() for token in re.findall(r"[A-Za-z0-9][A-Za-z0-9'-]{2,}", pair[1])
                    })),
                    pair[0],
                ),
            )
            chosen = []
            used = 0
            for sentence_index, sentence in ranked:
                sentence_terms = {
                    token.lower() for token in re.findall(r"[A-Za-z0-9][A-Za-z0-9'-]{2,}", sentence)
                }
                if not terms.intersection(sentence_terms):
                    continue
                if used + len(sentence) + 1 > budget:
                    continue
                chosen.append((sentence_index, sentence))
                used += len(sentence) + 1
            excerpt = " ".join(sentence for _, sentence in sorted(chosen)) if chosen else source_text[:budget]
        else:
            excerpt = source_text[:budget]
        excerpt = excerpt[:budget].strip()
        if excerpt:
            context.append(ContextItem(
                source_index=index,
                title=result.title,
                url=result.url,
                text=excerpt,
                content_type=content_type,
                relevance_status=relevance,
                quality_flags=flags,
            ))
            remaining -= len(excerpt)

    return context, sources


@app.post("/v1/scrape", dependencies=[Depends(require_api_key)])
async def scrape(payload: ScrapeRequest) -> dict:
    try:
        page = await scrape_url(str(payload.url))
    except httpx.TimeoutException as exc:
        raise HTTPException(status_code=504, detail="Page fetch timed out") from exc
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=502, detail=f"Page returned HTTP {exc.response.status_code}") from exc
    except (httpx.HTTPError, ValueError, UnicodeError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)[:240]) from exc
    return {"url": page["url"], "title": page["title"], "content": page["content"], "content_truncated": page["content_truncated"], "structured": page.get("structured", {})}


@app.post("/v1/crawl", dependencies=[Depends(require_api_key)])
async def crawl(payload: CrawlRequest) -> dict:
    try:
        pages = await crawl_site(str(payload.url), payload.max_pages, payload.max_depth, payload.allow_domains, payload.deny_domains, payload.use_sitemap)
    except (httpx.TimeoutException, httpx.HTTPError) as exc:
        raise HTTPException(status_code=502, detail="Crawl request failed") from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)[:240]) from exc
    return {"start_url": str(payload.url), "max_pages": payload.max_pages, "max_depth": payload.max_depth, "sitemap_discovery": payload.use_sitemap, "pages_attempted": len(pages), "pages_crawled": sum(1 for page in pages if page.get("status") != "error"), "pages_failed": sum(1 for page in pages if page.get("status") == "error"), "pages": pages}


@app.get("/health")
async def health() -> dict:
    settings = get_settings()
    try:
        async with httpx.AsyncClient(timeout=settings.request_timeout_seconds) as client:
            response = await client.get(f"{settings.searxng_url.rstrip('/')}/healthz")
            response.raise_for_status()
        search_status = "ok"
    except (httpx.HTTPError, ValueError):
        search_status = "unavailable"
    return {"status": "ok" if search_status == "ok" else "degraded", "search_backend": search_status, "crawler": "available"}


@app.post("/v1/search", response_model=SearchResponse, dependencies=[Depends(require_api_key)])
async def search(payload: SearchRequest) -> SearchResponse:
    settings = get_settings()
    limit = min(payload.max_results, settings.max_results_limit)
    params: dict[str, str | int] = {
        "q": payload.query,
        "format": "json",
        "categories": "news" if payload.topic == "news" else "general",
        "language": "all",
    }
    started = time.perf_counter()
    try:
        async with httpx.AsyncClient(timeout=settings.request_timeout_seconds, follow_redirects=True) as client:
            response = await client.get(f"{settings.searxng_url.rstrip('/')}/search", params=params)
            response.raise_for_status()
            data = response.json()
    except httpx.TimeoutException as exc:
        raise HTTPException(status_code=504, detail="Search backend timed out") from exc
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(status_code=502, detail="Search backend request failed") from exc

    normalized: list[SearchResult] = []
    seen_urls: set[str] = set()
    for item in data.get("results", []):
        raw_url = item.get("url")
        title = (item.get("title") or "").strip()
        if not raw_url or not title:
            continue
        parsed = urlparse(raw_url)
        if parsed.scheme not in {"http", "https"} or not parsed.hostname:
            continue
        host = parsed.hostname
        if payload.include_domains and not domain_matches(host, payload.include_domains):
            continue
        if payload.exclude_domains and domain_matches(host, payload.exclude_domains):
            continue
        normalized_key = canonical_url(raw_url)
        if normalized_key in seen_urls:
            continue
        seen_urls.add(normalized_key)
        try:
            normalized.append(SearchResult(
                title=title,
                url=raw_url,
                content=(item.get("content") or item.get("snippet") or "").strip(),
                score=float(item["score"]) if item.get("score") is not None else None,
                published_date=item.get("publishedDate") or item.get("published_date"),
            ))
        except (TypeError, ValueError):
            continue
        if len(normalized) >= limit:
            break

    if payload.extract_content and payload.max_content_results:
        selected = normalized[:payload.max_content_results]
        semaphore = asyncio.Semaphore(PAGE_FETCH_CONCURRENCY)
        timeout = httpx.Timeout(PAGE_FETCH_TIMEOUT, connect=3.0)
        limits = httpx.Limits(max_connections=PAGE_FETCH_CONCURRENCY, max_keepalive_connections=2)
        async with httpx.AsyncClient(
            timeout=timeout,
            limits=limits,
            follow_redirects=False,
            headers={"User-Agent": "NallyCreepyCrawley/0.2 (+page text extraction)"},
        ) as client:
            await asyncio.gather(
                *(enrich_result(result, client, semaphore) for result in selected)
            )

    context, sources = build_context(
        payload.query,
        normalized,
        payload.max_context_chars,
        payload.context_per_source_chars,
    )

    return SearchResponse(
        query=payload.query,
        context=context,
        sources=sources,
        results=normalized,
        response_time=round(time.perf_counter() - started, 3),
    )
