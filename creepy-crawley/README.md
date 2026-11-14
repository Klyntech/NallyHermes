# Nally Creepy Crawley

A private, self-hosted web-search API intended to provide search results and source-page text to the existing NallyHermes agent. NallyHermes remains responsible for interpreting evidence and writing answers; this service does not call an LLM or generate answers.

## What is included

- `POST /v1/search`: general/news search, result limit, domain include/exclude filters.
- Optional full-page text extraction for the top search results.
- Extraction status per result so the agent can distinguish full text from a search snippet.
- Duplicate URL removal.
- `GET /health`: API and embedded SearXNG health status.
- Bearer-token authentication for search requests.
- Normalized results: `title`, `url`, `content` (search snippet), `extracted_content` (readable page text), `extraction_status`, `score`, `published_date`.

SearXNG and the FastAPI application run in the **same container**. SearXNG listens only on loopback port 8080; only the API port is exposed.

## Page extraction behavior

Extraction is enabled by default. The service fetches readable HTML from up to five top results concurrently and returns up to 12,000 characters per page in `extracted_content`.

- `extract_content: false` disables page fetching and returns search snippets only.
- `max_content_results` controls how many top results are fetched (0–10, default 5).
- `extraction_status` is `success`, `unavailable`, or `skipped`.
- Non-HTML pages, blocked pages, unsupported content, and fetch failures return `unavailable`; they do not fail the search request.
- Fetches have a short timeout, a response-size cap, and redirect limits. Private/local network destinations and nonstandard ports are rejected to reduce SSRF risk.
- Page text is extracted locally with Trafilatura. No LLM or external answer-generation service is used.

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
  -d '{
    "query": "latest AI research",
    "max_results": 8,
    "topic": "general",
    "extract_content": true,
    "max_content_results": 5
  }'
```

News search: set `topic` to `news`. Domain filters accept hostnames such as `example.com`.

## Connect an existing agent

Point its search tool at `POST /v1/search`, send the bearer token, and pass the returned `results` array to NallyHermes. Prefer `extracted_content` when `extraction_status` is `success`; otherwise use `content` as the search snippet. Preserve each result's title and URL so NallyHermes can cite its sources.

This service returns source material only. It deliberately does not summarize pages, synthesize answers, or call an AI model.

## Deployment and security notes

- On Render, deploy this Dockerfile as the existing `NallyCreepyCrawley` service; no additional Render service is required.
- Set `API_KEY` in Render's Environment page. Never commit it.
- Set `SEARXNG_URL=http://127.0.0.1:8080` for the single-container deployment.
- SearXNG is bound to loopback and is not exposed as a public port.
- A random SearXNG secret is generated at container startup unless `SEARXNG_SECRET` is supplied.
- Search queries are sent to the upstream engines enabled in SearXNG. Results and availability depend on those engines and their rate limits.
- The combined workload may exceed the memory limit of Render's Free instance at higher traffic. Monitor memory and request latency; consider a larger instance if the service restarts or becomes slow.


## Scraping and crawling

The API also exposes bounded page extraction and same-host crawling. Both endpoints require the same Bearer API key as search.

### Scrape one page

`POST /v1/scrape`

```json
{
  "url": "https://example.com/article"
}
```

Returns the final URL, page title, extracted readable text, and a truncation flag.

### Crawl a site

`POST /v1/crawl`

```json
{
  "url": "https://example.com/",
  "max_pages": 5,
  "max_depth": 1
}
```

The crawler follows links only on the starting hostname. Limits are 1–20 pages and depth 0–2. Each page returns its URL, title, extracted content, depth, and discovered-link count; individual fetch failures are reported per page.

### Fetch safeguards

- Only public HTTP(S) destinations on standard ports are fetched.
- Private, loopback, and link-local IP destinations are rejected.
- Redirects are checked before following and limited to four hops.
- HTML downloads are capped at 2 MB per page.
- Extracted text is capped at 20,000 characters per page.
- Crawls are bounded by page count and depth; no off-site link following.


## Advanced crawling and extraction

- Sitemap discovery reads same-host sitemap declarations from `robots.txt` and common sitemap locations. Sitemap index files are supported; crawl page/depth limits still apply.
- Optional JavaScript-rendered extraction is supported through a separately configured, trusted renderer endpoint. Set `JS_RENDER_URL` to its HTTP API URL and optionally `JS_RENDER_TOKEN`; the backend calls it only when ordinary HTML extraction yields very little text. No browser process or extra Render service is installed in this container.
- PDF pages are extracted locally with PyPDF. PDF extraction is bounded by the existing 2 MB download limit, 100 pages, and 20,000 output characters.
- Structured metadata accompanies scrape, crawl, and search results: author, reported publication date, description, headings, tables, links, and content type where available. Dates remain source-reported, not independently verified.
- URL canonicalization removes fragments and normalizes hostnames. A bounded in-memory cache reuses fetched page data for five minutes (up to 128 pages per process).
- Crawl requests accept `allow_domains`, `deny_domains`, and `use_sitemap`. The start URL and discovered pages must satisfy the domain rules; crawling remains same-host.
- Crawl responses report attempted, successful, and failed page counts. `GET /metrics` (Bearer-authenticated) exposes lightweight process counters for fetches, cache hits, failures, crawled pages, and PDF extraction.
- Relevance labels are conservative lexical hints, not confidence probabilities. A matching page title alone cannot promote an unrelated passage into agent context. Low-relevance results remain visible in `results` but are excluded from `context`.

Example crawl request:

```json
{
  "url": "https://example.com/",
  "max_pages": 10,
  "max_depth": 2,
  "use_sitemap": true,
  "allow_domains": ["example.com"],
  "deny_domains": ["private.example.com"]
}
```

JavaScript rendering is optional. Only configure `JS_RENDER_URL` to a renderer you trust; the target page URL is sent to that service for rendering. Keep any renderer token in Render Environment Variables, never in source control.
