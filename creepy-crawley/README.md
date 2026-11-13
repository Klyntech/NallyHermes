# Nally Creepy Crawley

A private, self-hosted web-search API intended to replace the search provider behind an existing agent `web_search` tool.

## What is included

- `POST /v1/search`: general/news search, result limit, domain include/exclude filters.
- `GET /health`: API and embedded SearXNG health status.
- Bearer-token authentication for search requests.
- Normalized results: `title`, `url`, `content`, `score`, `published_date`.

SearXNG and the FastAPI application run in the **same container**. SearXNG listens only on loopback port 8080; only the API port is exposed.

## Run locally with Docker Compose

```bash
cp .env.example .env
# Edit .env and set API_KEY to a long random secret.
docker compose up --build -d
```

API docs: http://127.0.0.1:8000/docs

Health: http://127.0.0.1:8000/health

## Search

```bash
curl -X POST http://127.0.0.1:8000/v1/search \
  -H 'Authorization: Bearer YOUR_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"query":"latest AI research","max_results":8,"topic":"general"}'
```

News search: set `topic` to `news`. Domain filters accept hostnames such as `example.com`.

## Connect an existing agent

Point its search tool at `POST /v1/search`, send the bearer token, and map the returned `results` array to the fields your tool expects. This MVP does not implement Tavily's complete API contract or answer generation.

## Deployment and security notes

- On Render, deploy this Dockerfile as the existing `NallyCreepyCrawley` service; no additional Render service is required.
- Set `API_KEY` in Render's Environment page. Never commit it.
- Set `SEARXNG_URL=http://127.0.0.1:8080` for the single-container deployment.
- SearXNG is bound to loopback and is not exposed as a public port.
- A random SearXNG secret is generated at container startup unless `SEARXNG_SECRET` is supplied.
- Search queries are sent to the upstream engines enabled in SearXNG. Results and availability depend on those engines and their rate limits.
- The combined workload may exceed the memory limit of Render's Free instance. If the service restarts or is terminated for memory use, move to a larger instance plan or separate the workloads.
