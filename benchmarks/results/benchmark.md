# NallyHermes V1 vs V2 Orchestra Benchmark

## Run metadata

| Field | V1 | V2 |
|---|---|---|
| Commit | 4ba2b87084a4b003331e0f9c687bbf0822558edd | 60547778e564267e0ccc5219bc1429b4087a37f8 |
| Model | nvidia/nemotron-3.5-super-vl-120b-a12b | nvidia/nemotron-3.5-super-vl-120b-a12b |
| Status | completed | completed |

## Execution metrics

| Metric | V1 | V2 | V2 vs V1 |
|---|---:|---:|---:|
| Duration (ms) | 206123 | 332534 | 61.3% |
| Model calls | not instrumented | 22 | n/a |
| Median input tokens / call | n/a | 6897.5 | n/a |
| Median output tokens / call | n/a | 532.5 | n/a |
| Median total tokens / call | n/a | 7383 | n/a |
| Model-call errors | not instrumented | 0 | n/a |
| Model turns with tool calls | not instrumented | 20 | n/a |
| Tool calls requested by model | not instrumented | 46 | n/a |
| Progress events | 77 | 138 | 79.2% |
| Tool calls started | 18 | 31 | 72.2% |
| Tool errors | 3 | 6 | 100.0% |
| Cached read-only tool results | 0 | 14 | n/a |
| Retry events | 2 | 4 | 100.0% |
| Plan steps started | 4 | 2 | -50.0% |
| Plan steps completed | 4 | 0 | -100.0% |
| Plan steps partially completed | 0 | 1 | n/a |
| Plan steps failed | 0 | 0 | n/a |
| Plan steps blocked | 0 | 5 | n/a |
| Task outcome | not_reported | partial | n/a |

> Lower is not always better: fewer tool calls or events can mean efficiency, but can also mean incomplete work. Interpret metrics alongside the reports and event traces.

## V1 final response

# LightRAG Storage Options — Technical Report

**Prepared:** 2026-11-07  
**Scope:** Official LightRAG documentation and repository, storage backends, PostgreSQL/Neon suitability, production architecture recommendation  
**Evidence status:** All four research steps completed. Evidence is sufficient to answer the request; no further research is required.

---

## 1. Official documentation and repository

| Item | Value | Source |
|------|-------|--------|
| Organization | HKUDS (Data Intelligence Lab, University of Hong Kong) | GitHub README |
| Official repository | https://github.com/HKUDS/LightRAG | GitHub README |
| PyPI package | `lightrag-hku` | GitHub README |
| Paper / project site | https://lightrag.github.io (arXiv:2410.05779) | Paper site |
| Primary documentation | In-repository `docs/` directory, chiefly `docs/LightRAG-API-Server.md` | GitHub README |
| Configuration reference | `env.example` in repository root | GitHub README |
| Official Docker images | `ghcr.io/hkuds/lightrag` (GHCR, Cosign-signed) | GitHub README |

**Note:** `lightrag.github.io` is the paper landing page, not a hosted docs portal. The authoritative operational documentation lives in the GitHub repository under `docs/` (e.g., `LightRAG-API-Server.md`, `DockerDeployment.md`, `InteractiveSetup.md`, `ProgramingWithCore.md`), linked from the README.

---

## 2. Supported storage backends

LightRAG abstracts persistence into four storage roles, each pluggable via environment variables (`LIGHTRAG_KV_STORAGE`, `LIGHTRAG_VECTOR_STORAGE`, `LIGHTRAG_GRAPH_STORAGE`, `LIGHTRAG_DOC_STATUS_STORAGE`).

### Default backends (development only)

These are in-memory with local file persistence under `WORKING_DIR`, explicitly documented as suitable only for small-scale testing, evaluation, and debugging — **not production**:

| Role | Default implementation |
|------|------------------------|
| KV | `JsonKVStorage` |
| Vector | `NanoVectorDBStorage` |
| Graph | `NetworkXStorage` |
| Document status | `JsonDocStatusStorage` |

### Production backends

**PostgreSQL — officially recommended, single-backend for all four roles**
- `PGKVStorage`, `PGVectorStorage`, `PGGraphStorage` (also `PGTableGraphStorage`), `PGDocStatusStorage`
- Requires **pgvector** extension (vector) and **Apache AGE** extension (graph via `PGGraphStorage`/`AGEStorage`)
- Stock PostgreSQL without these extensions does **not** provide graph storage

**MongoDB — single-backend for all four roles**
- `MongoKVStorage`, `MongoVectorDBStorage`, `MongoGraphStorage`, `MongoDocStatusStorage`
- Limitation: MongoDB's native `$vectorSearch` requires **MongoDB Atlas** (cloud); not available on self-hosted Community/Enterprise

**OpenSearch — single-backend for all four roles**
- `OpenSearchKVStorage`, `OpenSearchVectorDBStorage`, `OpenSearchGraphStorage`, `OpenSearchDocStatusStorage`
- Requires OpenSearch 3.x+ with k-NN plugin; v1.5 storage path requires OpenSearch ≥ 3.3.0

**Specialized vector stores** (vector role only): `MilvusVectorDBStorage`, `QdrantVectorDBStorage`, `FaissVectorDBStorage`

**Specialized graph stores** (graph role only): `Neo4JStorage`, `MemgraphStorage`, `AGEStorage` (Apache AGE on PostgreSQL)

**KV / doc-status helpers:** `RedisKVStorage`, `RedisDocStatusStorage`

---

## 3. Differences between storage options

| Dimension | Default (Json/Nano/NetworkX) | PostgreSQL (all-in-one) | MongoDB (all-in-one) | OpenSearch (all-in-one) | Specialized (Milvus/Qdrant/Neo4j/Memgraph) |
|-----------|------------------------------|-------------------------|----------------------|-------------------------|--------------------------------------------|
| Production fit | No — dev/debug only | Yes (recommended) | Yes (Atlas for vector) | Yes (3.3.0+, k-NN) | Yes, but only for one role |
| Roles covered | All 4 | All 4 | All 4 | All 4 | Vector or graph only |
| Operational footprint | None (local files) | One Postgres + pgvector + AGE | One MongoDB (or Atlas) | One OpenSearch cluster | Multiple systems if mixing roles |
| Graph query power | Limited (NetworkX in-process) | Apache AGE / openCypher | Simple graph on collections | OpenSearch graph | Native Cypher (Neo4j/Memgraph) |
| Vector search | NanoVectorDB (local) | pgvector (HNSW indexes) | `$vectorSearch` (Atlas only) | Native k-NN | Native ANN (Milvus/Qdrant) |
| Workspace isolation | Subdirectories under `WORKING_DIR` | `workspace` column in tables | Collection name prefix | Index name prefix | Varies (payload filtering for Qdrant, labels for Neo4j/Memgraph) |
| Key caveat | Not for concurrent production use | Vector dimension fixed at table creation; changing embedding model requires clearing vector data + re-indexing | Vector search locked to Atlas | Upgrade path: OpenSearch < 3.3.0 must be upgraded before v1.5 storage path | Mixing stores increases operational complexity; no cross-store transactions |

**Key architectural points:**
- LightRAG does not support direct migration between storage implementations, with one exception: an already-extracted graph can be moved from `PGGraphStorage` to `PGTableGraphStorage` without re-indexing. All other backend changes require re-ingestion/re-indexing.
- The embedding model, dimension, and asymmetric-embedding settings must be fixed before the first document upload.

---

## 4. Is PostgreSQL/Neon a suitable storage setup?

### PostgreSQL — confirmed suitable and officially recommended

PostgreSQL is LightRAG's officially recommended production backend because it can serve all four storage types (KV, vector, graph, doc-status) in a single database, eliminating the need to run and sync Neo4j, Milvus, or Redis separately.

Real production configurations observed in repository issues use:
```
LIGHTRAG_KV_STORAGE=PGKVStorage
LIGHTRAG_VECTOR_STORAGE=PGVectorStorage
LIGHTRAG_GRAPH_STORAGE=PGGraphStorage
LIGHTRAG_DOC_STATUS_STORAGE=PGDocStatusStorage
POSTGRES_HOST=... POSTGRES_PORT=5432 POSTGRES_USER=... POSTGRES_DATABASE=LightRAG POSTGRES_MAX_CONNECTIONS=12
```

Requirements: PostgreSQL with **pgvector** (vector storage, HNSW indexes) and **Apache AGE** (graph storage via `PGGraphStorage`). The Railway production template runs LightRAG against a PostgreSQL image with both extensions pre-installed.

### Neon — partially suitable; key caveat unverified

Neon is a serverless PostgreSQL platform, so LightRAG's PostgreSQL storage classes (`PGKVStorage`, `PGVectorStorage`, `PGDocStatusStorage`) should work in principle because Neon is PostgreSQL-compatible and supports **pgvector**. However:

- **No official LightRAG documentation mentions Neon.** Any claim that LightRAG officially supports Neon would be unverified.
- **Apache AGE on Neon is unconfirmed.** `PGGraphStorage`/`AGEStorage` depends on the Apache AGE extension. No evidence was found that Neon offers AGE. If AGE is unavailable on Neon, graph storage cannot use PostgreSQL, breaking LightRAG's all-in-one PostgreSQL mode. Graph storage would need a separate backend (Neo4j/Memgraph) or AGE availability would need confirmation with Neon directly.

**Verdict:** PostgreSQL (self-hosted or managed Postgres with pgvector + AGE) is a verified, recommended production setup. Neon is plausible for KV/vector/doc-status given pgvector support, but the graph-storage dependency on Apache AGE makes it **not fully verified** for LightRAG's all-in-one PostgreSQL mode. Treat Neon as a candidate requiring extension verification, not a confirmed LightRAG production backend.

---

## 5. Compatibility limitations and configuration considerations

### Storage-specific limitations
- **Default file stores:** Not production-suitable (RAM-bounded, single-process, no concurrency safety).
- **MongoDB vector:** Requires MongoDB Atlas; self-hosted MongoDB cannot use `$vectorSearch`.
- **OpenSearch:** Requires OpenSearch 3.x+ with k-NN; clusters older than 3.3.0 must be upgraded before the v1.5 storage path.
- **PostgreSQL graph:** Requires Apache AGE extension; plain PostgreSQL is insufficient for `PGGraphStorage`.
- **Embedding immutability:** Changing embedding model, dimension, asymmetric-embedding mode, or prefixes requires clearing affected vector data and re-indexing. LightRAG provides no re-embedding tool.
- **No cross-backend migration:** Except `PGGraphStorage → PGTableGraphStorage`, switching storage backends requires re-ingestion.
- **Workspace isolation:** Required when multiple LightRAG instances share one external database. PostgreSQL uses a `workspace` column (default `default`). Reusing a workspace across instances causes data corruption.

### General operational considerations
- **Authentication:** With no `AUTH_ACCOUNTS` or `LIGHTRAG_API_KEY`, every endpoint is public — only safe on `127.0.0.1`. Required before exposing to a network.
- **Production server mode:** Use `lightrag-gunicorn --workers 4` (Gunicorn + Uvicorn); not supported on Windows.
- **Upgrades:** Stop all old writers/instances sharing the same storage and workspace before starting a new version; rolling restarts with mixed versions against shared Redis/PostgreSQL can corrupt state.
- **Embedding model:** Must be chosen before first upload; local deployment recommended (e.g., `BAAI/bge-m3`).
- **pgvector dimension:** Defined at initial table creation — align `EMBEDDING_DIM` with your model before startup.

---

## 6. Recommended production storage architecture for an AI agent

**Recommended: Unified PostgreSQL (pgvector + Apache AGE) for all four roles**

This matches LightRAG's official recommendation and minimizes operational complexity:

| Role | Backend | Implementation | Notes |
|------|---------|----------------|-------|
| KV | PostgreSQL | `PGKVStorage` | LLM cache, chunks, extraction results |
| Vector | PostgreSQL + pgvector | `PGVectorStorage` | HNSW indexes; set `EMBEDDING_DIM` upfront |
| Graph | PostgreSQL + Apache AGE | `PGGraphStorage` (or `PGTableGraphStorage`) | Requires AGE extension; openCypher queries |
| Doc status | PostgreSQL | `PGDocStatusStorage` | Ingestion tracking |

**Environment variables (example):**
```
LIGHTRAG_KV_STORAGE=PGKVStorage
LIGHTRAG_VECTOR_STORAGE=PGVectorStorage
LIGHTRAG_GRAPH_STORAGE=PGGraphStorage
LIGHTRAG_DOC_STATUS_STORAGE=PGDocStatusStorage
POSTGRES_HOST=<host> POSTGRES_PORT=5432 POSTGRES_USER=<user>
POSTGRES_PASSWORD=<password> POSTGRES_DATABASE=lightrag
POSTGRES_MAX_CONNECTIONS=12
POSTGRES_WORKSPACE=<agent-workspace>
EMBEDDING_DIM=1024   # must match embedding model; fixed after first index
```

**Deployment pattern:** Run LightRAG server via Docker Compose (`ghcr.io/hkuds/lightrag`) alongside a PostgreSQL service with pgvector and Apache AGE installed, behind authentication (`LIGHTRAG_API_KEY` or `AUTH_ACCOUNTS` + `TOKEN_SECRET`), bound to `0.0.0.0` only with auth, or `127.0.0.1` behind a reverse proxy with TLS. Use `lightrag-gunicorn` with multiple workers for production throughput.

**If AGE is unavailable (e.g., on Neon or a managed Postgres without AGE):** Split the graph role to a dedicated graph store — `Neo4JStorage` or `MemgraphStorage` — while keeping KV/vector/doc-status on PostgreSQL. This is a supported hybrid pattern but adds a second database to operate.

**Avoid:** Default `JsonKVStorage`/`NanoVectorDBStorage`/`NetworkXStorage` for any production workload; self-hosted MongoDB for vector storage; sharing one workspace across multiple LightRAG instances.

---

## Sources

1. LightRAG GitHub repository — https://github.com/HKUDS/LightRAG (README: storage backends, defaults, production recommendation)
2. LightRAG API Server docs — https://github.com/HKUDS/LightRAG/blob/main/docs/LightRAG-API-Server.md (storage types, workspace isolation, OpenSearch/PostgreSQL requirements, upgrade procedures)
3. LightRAG env.example — https://raw.githubusercontent.com/HKUDS/LightRAG/main/env.example (storage env vars, PostgreSQL config, workspace vars)
4. LightRAG paper/project site — https://lightrag.github.io (arXiv:2410.05779)
5. Railway LightRAG Postgres production template — https://railway.com/deploy/lightrag-knowledge-graph-rag-postgres-production--lightrag-postgres-graph-rag (pgvector + AGE requirement, all-four-roles on Postgres)
6. GitHub Issue #2255 (production PostgreSQL config example) — https://github.com/HKUDS/LightRAG/issues/2255
7. GitHub Issue #1927 (PostgreSQL workspace isolation) — https://github.com/HKUDS/LightRAG/issues/1927

---

## Disclosures / unverified items

- **Neon:** No official LightRAG documentation mentions Neon. PostgreSQL compatibility and pgvector support on Neon are inferred from Neon being a PostgreSQL platform; **Apache AGE availability on Neon could not be verified**, so Neon cannot be confirmed as a full all-in-one LightRAG backend.
- **Storage class list:** Compiled from the README, `docs/LightRAG-API-Server.md`, `env.example`, and corroborating third-party summaries; production configs in repository issues confirm `PGKVStorage`, `PGVectorStorage`, `PGGraphStorage`, `PGDocStatusStorage` in use.
- **DeepWiki storage page** was rate-limited (HTTP 429) and not used; all claims above are sourced from the official GitHub repository and its documentation.

## V2 final response

# LightRAG Storage Options — Technical Report (PARTIAL)

**Report status:** PARTIAL — research is incomplete. Execution shows Step 1 partial and Steps 2–6 blocked ("prerequisite step did not complete"). This report synthesizes only the evidence collected in the supplied JSON, separates documented facts from reasoned inference, and discloses everything that could not be verified.

**Evidence boundary:** Only sources listed in the provided JSON are used. Official sources: HKUDS/LightRAG GitHub repo, raw README, `docs/LightRAG-API-Server.md`, arXiv paper. Third-party sources (Railway deployment pages, AI/TLDR) are labeled as such and are not treated as official confirmation.

---

## 1. Official documentation and repository

### 1.1 Repository — SUPPORTED
- Official GitHub repository: **https://github.com/HKUDS/LightRAG** (also reachable as https://github.com/hkuds/lightrag; both returned HTTP 200). [call-49c8fb8a](https://github.com/hkuds/lightrag) [call-16bb6b7a](https://github.com/HKUDS/LightRAG)
- Raw README (HTTP 200): https://raw.githubusercontent.com/HKUDS/LightRAG/main/README.md [call-d1d3b1de](https://raw.githubusercontent.com/HKUDS/LightRAG/main/README.md) [call-a83172d9](https://raw.githubusercontent.com/HKUDS/LightRAG/main/README.md)
- Organization: **HKU Data Science Lab (HKUDS)**; license: MIT. [call-a41b4656](https://railway.com/deploy/lightrag-open-source-knowledge-graph-rag-on-railway--light-rag) [call-557bc61b](https://railway.com/deploy/lightrag-open-source-knowledge-graph-rag-on-railway--light-rag)
- Activity/popularity: ~34k+ GitHub stars, presented at EMNLP 2025, README updated ~4 weeks ago (per Railway listing), arXiv:2410.05779. [call-a41b4656](https://railway.com/deploy/lightrag-open-source-knowledge-graph-rag-on-railway--light-rag) [call-d1d3b1de](https://raw.githubusercontent.com/HKUDS/LightRAG/main/README.md)
- Python indicator: README shows a Python 3.10 badge. [call-d1d3b1de](https://raw.githubusercontent.com/HKUDS/LightRAG/main/README.md)

### 1.2 Documentation site — UNSUPPORTED (standalone site not confirmed)
- No standalone official documentation site URL was fetched or verified. [call-557bc61b](https://railway.com/deploy/lightrag-open-source-knowledge-graph-rag-on-railway--light-rag) explicitly notes the documentation site is not directly mentioned in the provided sources.
- In-repo documentation is accessible: `docs/` directory, README, and `docs/LightRAG-API-Server.md`. [call-a41b4656](https://railway.com/deploy/lightrag-open-source-knowledge-graph-rag-on-railway--light-rag) [call-f6bed629](https://github.com/HKUDS/LightRAG/blob/main/docs/LightRAG-API-Server.md) [call-b483f0c6](https://github.com/hkuds/lightrag)
- API server doc: https://github.com/HKUDS/LightRAG/blob/main/docs/LightRAG-API-Server.md [call-f6bed629](https://github.com/HKUDS/LightRAG/blob/main/docs/LightRAG-API-Server.md)

### 1.3 Storage/configuration/backend documentation sections — SUPPORTED (in-repo)
- `docs/LightRAG-API-Server.md` covers storage configuration via environment variables / `.env` file, recommended storage choices, and backend options. [call-f6bed629](https://github.com/HKUDS/LightRAG/blob/main/docs/LightRAG-API-Server.md) [call-b483f0c6](https://github.com/hkuds/lightrag)
- README points to `docs/` reference documentation and deployment/setup. [call-d1d3b1de](https://raw.githubusercontent.com/HKUDS/LightRAG/main/README.md) [call-b483f0c6](https://github.com/hkuds/lightrag)

---

## 2. Supported storage backends (PARTIALLY SUPPORTED — Step 2 was blocked)

Step 2 was not executed, so this is not an exhaustive, cross-checked enumeration. The entries below are drawn from official source excerpts (GitHub README content and `docs/LightRAG-API-Server.md`).

| Storage category | Backends referenced in evidence | Default (non-production) | Source |
|---|---|---|---|
| Key-value | PGKVStorage (PostgreSQL); MongoDB and OpenSearch as single-backend options | In-memory databases with local file persistence — "suitable only for small-scale testing and evaluation, not for production" | [call-f6bed629](https://github.com/HKUDS/LightRAG/blob/main/docs/LightRAG-API-Server.md) [call-b483f0c6](https://github.com/hkuds/lightrag) |
| Vector | PGVectorStorage (PostgreSQL, env example); MilvusVectorDBStorage; Milvus or Qdrant (specialized) | NanoVectorDB (in-memory, local file) — named in third-party/deployment references, not confirmed in the official excerpts collected | [call-f6bed629](https://github.com/HKUDS/LightRAG/blob/main/docs/LightRAG-API-Server.md) [call-b483f0c6](https://github.com/hkuds/lightrag) |
| Graph | PGGraphStorage (PostgreSQL, env example); MemgraphStorage; Neo4j or Memgraph (specialized) | NetworkX (in-memory, local file) — named in third-party references, not confirmed in official excerpts | [call-f6bed629](https://github.com/HKUDS/LightRAG/blob/main/docs/LightRAG-API-Server.md) [call-b483f0c6](https://github.com/hkuds/lightrag) |
| Document status | PGDocStatusStorage (PostgreSQL) | File-based / in-memory with local file persistence (general default statement); specific default doc-status class not confirmed in official excerpts | [call-f6bed629](https://github.com/HKUDS/LightRAG/blob/main/docs/LightRAG-API-Server.md) [call-b483f0c6](https://github.com/hkuds/lightrag) |

Additional documented detail:
- Milvus GPU: choose `cuda` if the host has NVIDIA GPU support and the NVIDIA Container Toolkit is installed. [call-f6bed629](https://github.com/HKUDS/LightRAG/blob/main/docs/LightRAG-API-Server.md)
- PostgreSQL, Milvus, and Memgraph can be run locally via Docker (`make env-storage`, answer yes). [call-f6bed629](https://github.com/HKUDS/LightRAG/blob/main/docs/LightRAG-API-Server.md)
- The GitHub README references a "Storage Types Supported" page for the complete per-backend list, but that page was not retrieved. [call-b483f0c6](https://github.com/hkuds/lightrag)

Cross-check: PostgreSQL/Milvus/Memgraph recommendations appear in both `docs/LightRAG-API-Server.md` [call-f6bed629](https://github.com/HKUDS/LightRAG/blob/main/docs/LightRAG-API-Server.md) and the GitHub README summary [call-b483f0c6](https://github.com/hkuds/lightrag).

---

## 3. Differences between available storage options (REASONED — not fully evidenced)

Step 3 was blocked; the following is inferred from the limited evidence and labeled as such.

- **Single-backend (all four types):** PostgreSQL (production-recommended), MongoDB, OpenSearch. Operational simplicity — one system to deploy, back up, and scale. [call-b483f0c6](https://github.com/hkuds/lightrag) [call-f6bed629](https://github.com/HKUDS/LightRAG/blob/main/docs/LightRAG-API-Server.md)
- **Specialized vector:** Milvus, Qdrant. Likely stronger vector search/scale, but adds a separate system to operate. Milvus supports GPU via `cuda`. [call-b483f0c6](https://github.com/hkuds/lightrag) [call-f6bed629](https://github.com/HKUDS/LightRAG/blob/main/docs/LightRAG-API-Server.md)
- **Specialized graph:** Neo4j, Memgraph. Graph query/traversal strengths; adds operational complexity. [call-b483f0c6](https://github.com/hkuds/lightrag) [call-f6bed629](https://github.com/HKUDS/LightRAG/blob/main/docs/LightRAG-API-Server.md)
- **Default file/in-memory:** KV, vector, and graph stores are in-memory with local file persistence — explicitly not for production. [call-b483f0c6](https://github.com/hkuds/lightrag)

**Inferred trade-offs:** PostgreSQL single-backend = simplest operations, possibly lower peak vector/graph throughput than specialized engines; specialized backends = better domain performance but more systems to deploy, back up, and keep consistent; default file-based = zero operational overhead but not production-safe or scalable.

---

## 4. PostgreSQL / Neon suitability

### 4.1 PostgreSQL as a LightRAG backend — SUPPORTED
- Officially supported and recommended for production: "For production deployments, PostgreSQL (recommended), MongoDB, or OpenSearch can provide all four storage types through a single backend." [call-f6bed629](https://github.com/HKUDS/LightRAG/blob/main/docs/LightRAG-API-Server.md) [call-b483f0c6](https://github.com/hkuds/lightrag)
- PostgreSQL can serve all four storage types (KV, vector, graph, doc-status) on its own. [call-b483f0c6](https://github.com/hkuds/lightrag)
- Storage classes: `PGKVStorage`, `PGDocStatusStorage`, `PGVectorStorage`, `PGGraphStorage` (env example). [call-f6bed629](https://github.com/HKUDS/LightRAG/blob/main/docs/LightRAG-API-Server.md)
- Can run PostgreSQL locally via Docker. [call-f6bed629](https://github.com/HKUDS/LightRAG/blob/main/docs/LightRAG-API-Server.md)

### 4.2 Neon — UNSUPPORTED (not evidenced)
- Neon is **not mentioned anywhere** in the collected evidence. Neon-specific compatibility (serverless architecture, connection pooling, vector extensions) cannot be verified from official sources.
- Inference only (unverified): because LightRAG's PostgreSQL backend is configured through connection-style settings and standard storage classes, a PostgreSQL-compatible service such as Neon *might* work if it provides whatever extensions the vector store needs and accepts LightRAG's connection parameters. This is **not confirmed**.

### 4.3 Required extensions such as pgvector — UNSUPPORTED (not evidenced)
- Sources reference `PGVectorStorage` but do **not** document the `pgvector` extension or any extension requirement. [call-f6bed629](https://github.com/HKUDS/LightRAG/blob/main/docs/LightRAG-API-Server.md)
- Whether pgvector (or another extension) is mandatory is unverified.

### 4.4 Gaps / unsupported features for PostgreSQL/Neon — PARTIALLY SUPPORTED
- Documented: default in-memory/file stores are not for production; PostgreSQL is the recommended production backend. [call-b483f0c6](https://github.com/hkuds/lightrag) [call-f6bed629](https://github.com/HKUDS/LightRAG/blob/main/docs/LightRAG-API-Server.md)
- Not documented in evidence: specific PostgreSQL gaps, Neon gaps, concurrent-write behavior, index-rebuild procedures.

---

## 5. Compatibility limitations and configuration considerations (PARTIALLY SUPPORTED)

- Configuration mechanism: command-line arguments, environment variables, or `.env` file (CLI highest priority). Storage config via env vars or `.env`; sample file `env.example`; `make env-storage` to configure storage. [call-f6bed629](https://github.com/HKUDS/LightRAG/blob/main/docs/LightRAG-API-Server.md)
- Confirmed storage env vars: `LIGHTRAG_KV_STORAGE`, `LIGHTRAG_DOC_STATUS_STORAGE`, `LIGHTRAG_VECTOR_STORAGE`, `LIGHTRAG_GRAPH_STORAGE`. [call-f6bed629](https://github.com/HKUDS/LightRAG/blob/main/docs/LightRAG-API-Server.md)
- Official docs' example recommended choices: `LIGHTRAG_KV_STORAGE=PGKVStorage`, `LIGHTRAG_DOC_STATUS_STORAGE=PGDocStatusStorage`, `LIGHTRAG_VECTOR_STORAGE=MilvusVectorDBStorage`, `LIGHTRAG_GRAPH_STORAGE=MemgraphStorage`. [call-f6bed629](https://github.com/HKUDS/LightRAG/blob/main/docs/LightRAG-API-Server.md) (Note: this mixes PostgreSQL KV/doc-status with Milvus vector and Memgraph graph.)
- PostgreSQL connection details (e.g., `POSTGRES_HOST=localhost`, `POSTGRES_PORT=5432`, `POSTGRES_USER=...`) appear in third-party/deployment references but are **not present in the official excerpts collected** — treat as unverified.
- Python 3.10 indicated by README badge; no storage-backend version constraints documented in evidence. [call-d1d3b1de](https://raw.githubusercontent.com/HKUDS/LightRAG/main/README.md)
- Hardware (self-hosting, third-party Railway listing): min 1 vCPU / 1 GB RAM; recommended 2 vCPU / 4 GB RAM; storage 1 GB min / 5 GB+ recommended; GPU not required. [call-a41b4656](https://railway.com/deploy/lightrag-open-source-knowledge-graph-rag-on-railway--light-rag)
- Known limitations (concurrent writes, embedding coupling, index rebuilds): **not documented** in evidence.
- Backup, migration, operational considerations: **not documented** beyond running PostgreSQL/Milvus/Memgraph via Docker and the hardware guidance above. [call-f6bed629](https://github.com/HKUDS/LightRAG/blob/main/docs/LightRAG-API-Server.md) [call-a41b4656](https://railway.com/deploy/lightrag-open-source-knowledge-graph-rag-on-railway--light-rag)

---

## 6. Recommended production storage architecture (REASONED — disclosed as inference)

Step 6 was blocked; this recommendation is reasoned from the evidence and must be validated against current official documentation before production use.

**Primary recommendation: PostgreSQL single-backend for all four storage types.**
- Justification: officially recommended for production; one system to operate, back up, and scale; supports KV (`PGKVStorage`), doc-status (`PGDocStatusStorage`), vector (`PGVectorStorage`), graph (`PGGraphStorage`). [call-f6bed629](https://github.com/HKUDS/LightRAG/blob/main/docs/LightRAG-API-Server.md) [call-b483f0c6](https://github.com/hkuds/lightrag)
- Deployment topology: managed PostgreSQL (or self-hosted via Docker) in the same region as the LightRAG agent to minimize latency; run LightRAG as container(s) from `ghcr.io/hkuds/lightrag` adjacent to the database. [call-a41b4656](https://railway.com/deploy/lightrag-open-source-knowledge-graph-rag-on-railway--light-rag)
- Configuration (per official docs): set the four `LIGHTRAG_*_STORAGE` env vars via `.env`/environment. Note the official docs' "recommended storage choices" example instead pairs Milvus + Memgraph; using PostgreSQL for all four is also documented as supported. [call-f6bed629](https://github.com/HKUDS/LightRAG/blob/main/docs/LightRAG-API-Server.md) [call-b483f0c6](https://github.com/hkuds/lightrag)
- If vector/search throughput exceeds PostgreSQL: consider offloading vector to Milvus/Qdrant and/or graph to Neo4j/Memgraph, accepting multi-system operations. [call-b483f0c6](https://github.com/hkuds/lightrag) [call-f6bed629](https://github.com/HKUDS/LightRAG/blob/main/docs/LightRAG-API-Server.md)

**Neon:** Not recommended for adoption without verification — Neon is not referenced in the official LightRAG sources collected; compatibility is unknown.

**Configuration parameters to set (from evidence):** the four `LIGHTRAG_*_STORAGE` env vars; PostgreSQL host/port/user/password/database (connection details not confirmed in official excerpts); LLM/embedding binding (separate from storage). [call-f6bed629](https://github.com/HKUDS/LightRAG/blob/main/docs/LightRAG-API-Server.md)

**Monitoring/backup/scaling (unverified, reasoned only):** monitor DB connections, query latency, replication lag; schedule regular PostgreSQL backups (managed-service backups or `pg_dump`); test restore; scale vertically before horizontally for single-node PostgreSQL; plan for re-indexing if the embedding model changes (embedding coupling is not documented).

---

## 7. Claim ledger evaluation

| Claim | Status | Basis / evidence | Source IDs | Source URLs |
|---|---|---|---|---|
| step_1:claim_1 — Official GitHub repo URL identified and accessible | supported | HTTP 200 for repo and raw README | call-49c8fb8a, call-16bb6b7a, call-d1d3b1de | https://github.com/HKUDS/LightRAG ; https://raw.githubusercontent.com/HKUDS/LightRAG/main/README.md |
| step_1:claim_2 — Official documentation site URL identified and accessible | unsupported | No standalone docs site fetched; call-557bc61b notes docs site not directly mentioned | call-557bc61b | https://railway.com/deploy/lightrag-open-source-knowledge-graph-rag-on-railway--light-rag |
| step_1:claim_3 — Repo confirmed primary/maintained (org, activity, stars) | supported | HKU Data Science Lab, MIT, ~4 weeks updated, 34k+ stars, EMNLP 2025, arXiv:2410.05779 | call-a41b4656, call-d1d3b1de, call-557bc61b | https://railway.com/deploy/lightrag-open-source-knowledge-graph-rag-on-railway--light-rag ; https://raw.githubusercontent.com/HKUDS/LightRAG/main/README.md |
| step_1:claim_4 — Docs sections covering storage/config/backends located | supported | `docs/LightRAG-API-Server.md` + README cover storage config, env vars, backends | call-f6bed629, call-b483f0c6, call-a41b4656 | https://github.com/HKUDS/LightRAG/blob/main/docs/LightRAG-API-Server.md ; https://github.com/hkuds/lightrag |
| step_2:claim_1 — Key-value backends listed with official links | partially_supported | PGKVStorage; MongoDB/OpenSearch single-backend; default in-memory/file | call-f6bed629, call-b483f0c6 | https://github.com/HKUDS/LightRAG/blob/main/docs/LightRAG-API-Server.md ; https://github.com/hkuds/lightrag |
| step_2:claim_2 — Vector backends listed with official links | partially_supported | PGVectorStorage, MilvusVectorDBStorage, Milvus/Qdrant | call-f6bed629, call-b483f0c6 | same as above |
| step_2:claim_3 — Graph backends listed with official links | partially_supported | PGGraphStorage, MemgraphStorage, Neo4j/Memgraph | call-f6bed629, call-b483f0c6 | same as above |
| step_2:claim_4 — Document status storage identified with official links | partially_supported | PGDocStatusStorage | call-f6bed629 | https://github.com/HKUDS/LightRAG/blob/main/docs/LightRAG-API-Server.md |
| step_2:claim_5 — Each backend cross-checked against docs/repo | partially_supported | Some cross-check between API-Server.md and README summary; "Storage Types Supported" page not fetched | call-f6bed629, call-b483f0c6 | same as above |
| step_3:claim_1..4 — Comparisons and trade-offs | unsupported | Step 3 blocked; no direct evidence (inference only in §3) | — | — |
| step_4:claim_1 — PostgreSQL officially supported as backend | supported | Explicitly recommended; all four storage types | call-b483f0c6, call-f6bed629 | https://github.com/hkuds/lightrag ; https://github.com/HKUDS/LightRAG/blob/main/docs/LightRAG-API-Server.md |
| step_4:claim_2 — Neon-specific compatibility | unsupported | Neon not mentioned in any source | — | — |
| step_4:claim_3 — Required extensions such as pgvector | unsupported | `PGVectorStorage` referenced; pgvector not documented | call-f6bed629 | https://github.com/HKUDS/LightRAG/blob/main/docs/LightRAG-API-Server.md |
| step_4:claim_4 — Gaps/unsupported features for PostgreSQL/Neon | partially_supported | Default not for production; PostgreSQL recommended; specific gaps not documented | call-b483f0c6, call-f6bed629 | same as above |
| step_5:claim_1 — Version compatibility constraints | partially_supported | Python 3.10 badge; no backend version constraints documented | call-d1d3b1de | https://raw.githubusercontent.com/HKUDS/LightRAG/main/README.md |
| step_5:claim_2 — Required env vars and config keys | partially_supported | Four `LIGHTRAG_*_STORAGE` vars confirmed; `POSTGRES_*` not in official excerpts | call-f6bed629 | https://github.com/HKUDS/LightRAG/blob/main/docs/LightRAG-API-Server.md |
| step_5:claim_3 — Known limitations (concurrent writes, embedding coupling, index rebuilds) | unsupported | Not documented | — | — |
| step_5:claim_4 — Backup, migration, operational considerations | partially_supported | Docker deployment + hardware only; backup/migration not documented | call-f6bed629, call-a41b4656 | https://github.com/HKUDS/LightRAG/blob/main/docs/LightRAG-API-Server.md ; https://railway.com/deploy/lightrag-open-source-knowledge-graph-rag-on-railway--light-rag |
| step_6:claim_1..5 — Production recommendation | unsupported (reasoned inference provided) | Step 6 blocked; recommendation in §6 is inference, not evidence | — | — |

---

## 8. Unresolved claims and blocked steps

**Blocked steps:** 2, 3, 4, 5, 6 (all "blocked — prerequisite step did not complete"). Step 1 is partial.

**Unresolved / unverified items:**
1. Official standalone documentation site URL (step_1:claim_2).
2. Exhaustive official per-backend enumeration with source links (step_2 claims).
3. Detailed per-backend comparisons and trade-offs with citations (step_3 claims).
4. Neon compatibility; `pgvector`/extension requirement; PostgreSQL/Neon-specific gaps (step_4:claim_2–4).
5. Backend version constraints; full env-var list including `POSTGRES_*`; known limitations; backup/migration runbooks (step_5 claims).
6. Validated production architecture with monitoring, backup, and scaling guidance (step_6 claims) — provided in §6 as reasoned inference only.

**Evidence needed to close each gap:** fetch `docs/LightRAG-API-Server.md` and any `docs/` storage pages directly; locate and fetch an official docs site if one exists; confirm `pgvector`/extension requirements; confirm whether Neon or other serverless PostgreSQL offerings are supported; obtain backend version constraints and operational/backup runbooks.

---

## 9. Coverage statement

**Covered (evidence-supported):** official repository identification and accessibility (https://github.com/HKUDS/LightRAG); in-repo documentation location; maintaining organization (HKU Data Science Lab), recent activity, stars, arXiv paper; PostgreSQL officially supported and recommended for all four storage types (KV, vector, graph, document status); confirmed storage env vars (`LIGHTRAG_KV_STORAGE`, `LIGHTRAG_DOC_STATUS_STORAGE`, `LIGHTRAG_VECTOR_STORAGE`, `LIGHTRAG_GRAPH_STORAGE`); default in-memory/file stores explicitly not for production; specialized backends (Milvus/Qdrant vector, Neo4j/Memgraph graph, MongoDB/OpenSearch single-backend); Python 3.10 indicator; hardware guidance; Docker deployment path.

**Not covered / unverified:** standalone official docs site; exhaustive backend list; detailed comparisons; Neon compatibility; `pgvector`/extension requirements; full `POSTGRES_*` configuration; known limitations; backup/migration; a validated production architecture with monitoring/backup/scaling.

**Bottom line:** This is a PARTIAL report. PostgreSQL is the only production backend confirmed by official LightRAG sources; Neon and `pgvector` cannot be verified from the evidence collected. Do not treat the reasoned recommendations in §3, §4 (inference portions), and §6 as confirmed facts.

## Execution status: PARTIAL
The execution completed 0 of 6 planned steps; 1 were partial, 0 failed, and 5 were blocked.
Reason: Some steps could not run because one or more prerequisite steps did not complete.
Unresolved requirements: Official GitHub repository URL identified and accessible; Official documentation site URL identified and accessible; Repository confirmed as primary/maintained source (organization, recent activity, stars); Documentation sections covering storage, configuration, and backends located; Key-value storage backends listed with official source links; Vector storage backends listed with official source links; Graph storage backends listed with official source links; Document status storage mechanism identified with official source links; Each backend claim cross-checked against documentation or repository source code; Comparison of key-value backends covering persistence, performance, and scalability; Comparison of vector backends covering index types, distance metrics, and managed vs self-hosted; Comparison of graph backends covering query language, ACID guarantees, and horizontal scaling; Trade-offs documented for each option with citations; Confirmation whether PostgreSQL is officially supported as a LightRAG backend; Neon-specific compatibility findings (serverless architecture, connection pooling, vector extensions); Required extensions such as pgvector identified; Gaps or unsupported features for PostgreSQL/Neon documented; Version compatibility constraints between LightRAG and storage backends listed; Required environment variables and configuration keys identified; Known limitations documented (concurrent writes, embedding coupling, index rebuilds); Backup, migration, and operational considerations noted; Recommended backend per storage category with justification; Deployment topology specified (managed vs self-hosted, region strategy); Configuration parameters and environment variables recommended; Monitoring, backup, and scaling guidance provided; Final recommendation with source links and disclosure of any unverified claims

## Human evaluation (0–5 each)

| Dimension | V1 | V2 |
|---|---:|---:|
| Source credibility | pending | pending |
| Factual accuracy | pending | pending |
| Coverage | pending | pending |
| Recommendation evidence | pending | pending |
| Structure/readability | pending | pending |
| Uncertainty/honesty | pending | pending |
| Actionability | pending | pending |

## Limitations

- This is one scenario/run per version; it is an observed comparison, not a statistically conclusive benchmark.
- Both runs use the same configured model and API credentials, but provider-side nondeterminism and rate limits can affect results.
- V1 emits legacy progress events; V2 additionally emits structured Orchestra events. Their event counts are not directly equivalent.
- A completed workflow means the process returned; inspect each version task_status before interpreting the research as complete. A completed workflow does not prove every factual claim is correct; inspect the source links in each answer.
- The benchmark database is isolated from production. LightRAG is disabled for this research-only scenario.

## Raw traces

- V1: `v1/benchmarks/results/run.json` (also retained as an Actions artifact)
- V2: `benchmarks/results/run.json`
