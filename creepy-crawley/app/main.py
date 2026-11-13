from __future__ import annotations

import secrets
import time
from typing import Literal
from urllib.parse import urlparse

import httpx
from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field, HttpUrl

from .config import get_settings

bearer_scheme = HTTPBearer(auto_error=False)

app = FastAPI(
    title="Nally Creepy Crawley",
    description="Private, self-hosted web search API backed by SearXNG.",
    version="0.1.0",
)


class SearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=500)
    max_results: int = Field(default=10, ge=1, le=100)
    topic: Literal["general", "news"] = "general"
    include_domains: list[str] = Field(default_factory=list)
    exclude_domains: list[str] = Field(default_factory=list)


class SearchResult(BaseModel):
    title: str
    url: HttpUrl
    content: str = ""
    score: float | None = None
    published_date: str | None = None


class SearchResponse(BaseModel):
    query: str
    answer: str | None = None
    images: list = Field(default_factory=list)
    results: list[SearchResult]
    response_time: float


def require_api_key(credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme)) -> None:
    expected = get_settings().api_key
    if not expected or expected == "change-me-to-a-long-random-secret":
        raise HTTPException(status_code=503, detail="API key is not configured. Set API_KEY before using the search endpoint.")
    supplied = credentials.credentials if credentials else ""
    if not secrets.compare_digest(supplied, expected):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API key")


def domain_matches(host: str, domains: list[str]) -> bool:
    host = host.lower().rstrip(".")
    return any(host == d.lower().strip().lstrip(".") or host.endswith("." + d.lower().strip().lstrip(".")) for d in domains)


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
    return {"status": "ok" if search_status == "ok" else "degraded", "search_backend": search_status}


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

    return SearchResponse(
        query=payload.query,
        results=normalized,
        response_time=round(time.perf_counter() - started, 3),
    )
