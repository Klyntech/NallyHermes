# Nally Creepy Crawley

A private, self-hosted web-search API intended to replace the search provider behind an existing agent `web_search` tool. The first version uses SearXNG for metasearch and exposes a small Tavily-shaped response contract.

## What is included

- `POST /v1/search`: general/news search, result limit, domain include/exclude filters.
- `GET /health`: API and SearXNG health status.
- Bearer-token authentication for search requests.
- Normalized results: `title`, `url`, `content`, `score`, `published_date`.
- Docker Compose deployment for the API and SearXNG.

This is a search-provider replacement, not a new search index. SearXNG queries configured upstream engines; availability and results depend on those engines and their rate limits.

## Run locally with Docker

```bash
cp .env.example .env
# Edit .env and set API_KEY to a long random secret.
docker compose up --build -d
```

API docs: http://127.0.0.1:8000/docs
Health: `curl http://127.0.0.1:8000/health`

## Search

```bash
curl -X POST http://127.0.0.1:8000/v1/search \\
  -H 'Authorization: Bearer YOUR_API_KEY' \\
  -H 'Content-Type: application/json' \\
  -d '{"query":"latest AI research","max_results":8,"topic":"general"}'
```

News search: set `topic` to `news`. Domain filters accept hostnames such as `example.com`.

## Connect an existing agent

Point its search tool at `POST /v1/search`, send the bearer token, and map the returned `results` array to the fields your tool expects. The response is intentionally close to common Tavily result fields, but this MVP does not yet implement Tavily's complete API contract or `answer` generation.

## Security and production notes

- Keep the API bound to localhost or a private network; do not expose it publicly without TLS and network-level access controls.
- Replace the example API and SearXNG secrets before deployment.
- Set `limiter: true` and configure a trusted reverse proxy if exposing SearXNG beyond the internal Docker network.
- Add rate limiting, request logging policy, monitoring, and automated tests before production use.
- Search queries are sent to the upstream engines configured in SearXNG. For strict privacy, review and restrict those engines.
