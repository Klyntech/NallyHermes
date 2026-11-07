# NallyHermes V1 vs V2 Orchestra Benchmark

## Run metadata

| Field | V1 | V2 |
|---|---|---|
| Commit | 4ba2b87084a4b003331e0f9c687bbf0822558edd | a8c17946edfa484853c0c7658c2af9e383aa0857 |
| Model | nvidia/nemotron-3.5-super-vl-120b-a12b | nvidia/nemotron-3.5-super-vl-120b-a12b |
| Status | completed | completed |

## Execution metrics

| Metric | V1 | V2 | V2 vs V1 |
|---|---:|---:|---:|
| Duration (ms) | 170590 | 423067 | 148.0% |
| Model calls | not instrumented | 20 | n/a |
| Median input tokens / call | n/a | 49794 | n/a |
| Median output tokens / call | n/a | 600 | n/a |
| Median total tokens / call | n/a | 51087.5 | n/a |
| Model-call errors | not instrumented | 0 | n/a |
| Progress events | 96 | 126 | 31.3% |
| Tool calls started | 23 | 32 | 39.1% |
| Tool errors | 3 | 6 | 100.0% |
| Retry events | 2 | 4 | 100.0% |
| Plan steps started | 4 | 4 | 0.0% |
| Plan steps completed | 4 | 4 | 0.0% |
| Plan steps failed | 0 | 0 | n/a |

> Lower is not always better: fewer tool calls or events can mean efficiency, but can also mean incomplete work. Interpret metrics alongside the reports and event traces.

## V1 final response

# Technical Report: LightRAG Storage Options Investigation

## 1. Official Documentation and Repository

| Item | Value |
|------|-------|
| **Official GitHub repository** | https://github.com/HKUDS/LightRAG — `HKUDS/LightRAG`, "[EMNLP2025] LightRAG: Simple and Fast Retrieval-Augmented Generation" |
| **Project / paper page** | https://lightrag.github.io (University of Hong Kong Data Intelligence Lab) |
| **arXiv paper** | https://arxiv.org/abs/2410.05779 |
| **Detailed operational docs** | Stored in the repo's `/docs` folder (`ProgramingWithCore.md`, `LightRAG-API-Server.md`, `DockerDeployment.md`, etc.) — not on lightrag.github.io, which is primarily a paper landing page |

## 2. Supported Storage Backends

LightRAG defines four pluggable storage roles:

| Role | Default (dev) | Production-capable backends |
|------|--------------|------------------------------|
| **KV Storage** | `JsonKVStorage` | `PGKVStorage`, `RedisKVStorage`, `MongoKVStorage`, `OpenSearchKVStorage` |
| **Vector Storage** | `NanoVectorDBStorage` | `PGVectorStorage`, `MilvusVectorDBStorage`, `ChromaVectorDBStorage`, `FaissVectorDBStorage`, `MongoVectorDBStorage`, `QdrantVectorDBStorage`, `OpenSearchVectorDBStorage` |
| **Graph Storage** | `NetworkXStorage` | `Neo4JStorage`, `PGGraphStorage`, `PGTableGraphStorage`, `AGEStorage`, `OpenSearchGraphStorage`, `MemgraphStorage` |
| **Doc Status Storage** | `JsonDocStatusStorage` | `PGDocStatusStorage`, `MongoDocStatusStorage`, `OpenSearchDocStatusStorage` |

**Single-backend options** (one database for all four roles): PostgreSQL (officially recommended), MongoDB, OpenSearch.

**Specialized per-role options:** Milvus/Qdrant (vector), Neo4j/Memgraph (graph).

**Community branches (not main):** `dev-lancedb`, `dev-nebula-graph` — not officially supported for production.

The four defaults (`JsonKVStorage`, `NanoVectorDBStorage`, `NetworkXStorage`, `JsonDocStatusStorage`) are file-based/in-memory under `working_dir`, bounded by RAM, and explicitly not for production.

## 3. Differences Between Storage Options

**PostgreSQL** can serve all four roles in one instance (`PGKVStorage`, `PGVectorStorage` via pgvector, `PGGraphStorage` via Apache AGE or `PGTableGraphStorage` on plain tables, `PGDocStatusStorage`). This is the simplest operations story — single backup, single connection pool. Requires PostgreSQL 16.6+ plus the `pgvector` extension, and `apache_age` if using `PGGraphStorage`.

**MongoDB** and **OpenSearch** are also single-backend options. OpenSearch requires version 3.3.0+ for the v1.5 storage path.

**Specialized backends** (Neo4j, Memgraph for graph; Milvus, Qdrant for vector) offer better performance for their specific role but require managing additional services.

**Redis** supports KV and doc-status only — it cannot serve vector or graph roles on its own.

**Workspace isolation** differs by backend: file subdirectories (defaults), collection/index name prefixes (Redis, MongoDB, OpenSearch), a `workspace` column in tables (PostgreSQL KV/vector/doc-status), labels (Neo4j/Memgraph), or payload partitioning (Qdrant). Default workspace: PostgreSQL = `default`; Neo4j = `base`.

## 4. Is PostgreSQL / Neon Suitable?

**PostgreSQL: Yes — officially recommended for production.** It can host all four storage roles on a single instance.

**Neon: Partially suitable.** Neon supports pgvector (confirmed from Neon's documentation), so `PGVectorStorage` works. `PGKVStorage` and `PGDocStatusStorage` should work via standard connection strings. However, **Apache AGE support on Neon is unconfirmed** — `PGGraphStorage` requires the AGE extension (`shared_preload_libraries = 'age'`), which may not be available on serverless Neon. Workarounds: use `PGTableGraphStorage` (graph on plain indexed tables, no AGE required) or pair Neon with a dedicated graph store (Neo4j/Memgraph).

Neon-specific considerations: serverless cold-start latency, PgBouncer-based connection pooling, free tier limits (0.5 GB storage, 100 compute hours/month).

## 5. Compatibility Limitations and Configuration Considerations

- **No direct storage migration** between implementations (one exception: an already-extracted graph can move from `PGGraphStorage` to `PGTableGraphStorage` without re-indexing). Choose storage before the first upload.
- **Embedding model/dimension is locked after indexing.** Changing model, dimension, asymmetric-embedding flag, or prefixes requires clearing vector data and re-indexing. PostgreSQL vector dimension must be defined at initial table creation.
- **Workspace isolation is mandatory** when multiple instances share one external database — use distinct `WORKSPACE` (or `POSTGRES_WORKSPACE`) values, otherwise data will conflict and be corrupted.
- **Authentication:** Without `AUTH_ACCOUNTS`/`LIGHTRAG_API_KEY`, all endpoints are public — only safe on `127.0.0.1`.
- **Production server:** `lightrag-gunicorn --workers 4` (not supported on Windows); `lightrag-server` (Uvicorn) is for simple/single-worker runs.
- **Rolling restart:** Stop all old writers sharing the same storage/workspace before starting a new version.
- **OpenSearch:** v1.5 storage path requires OpenSearch ≥ 3.3.0.

## 6. Recommended Production Storage Architecture

**Primary recommendation: Unified PostgreSQL backend for all four roles.**

```
LightRAG Server (gunicorn + uvicorn, workers ≥ 2)
  └─ PostgreSQL 16.6+ (pgvector + apache_age optional)
       ├─ PGKVStorage            (LLM cache, chunks, extraction results)
       ├─ PGVectorStorage        (vectors, HNSW index)
       ├─ PGTableGraphStorage    (graph on plain tables — no AGE required)
       │   OR PGGraphStorage     (graph via Apache AGE)
       └─ PGDocStatusStorage     (document indexing status)
```

**Key `.env` settings:**
```bash
LIGHTRAG_KV_STORAGE=PGKVStorage
LIGHTRAG_VECTOR_STORAGE=PGVectorStorage
LIGHTRAG_GRAPH_STORAGE=PGTableGraphStorage   # or PGGraphStorage if AGE available
LIGHTRAG_DOC_STATUS_STORAGE=PGDocStatusStorage
POSTGRES_HOST=...
POSTGRES_PORT=5432
POSTGRES_USER=...
POSTGRES_PASSWORD=...
POSTGRES_DATABASE=...
POSTGRES_MAX_CONNECTIONS=20
POSTGRES_WORKSPACE=production
EMBEDDING_DIM=1024   # must match embedding model exactly
```

**If Neon cannot run Apache AGE:** Use Neon (pgvector) for KV/vector/doc-status and Neo4j or Memgraph for the graph role.

**Avoid for production:** in-memory defaults and LanceDB/Nebula community branches.

## Sources

1. LightRAG repository: https://github.com/HKUDS/LightRAG
2. Programming With LightRAG Core (storage backends): https://raw.githubusercontent.com/HKUDS/LightRAG/main/docs/ProgramingWithCore.md
3. LightRAG Server docs (configuration, workspace isolation, production): https://raw.githubusercontent.com/HKUDS/LightRAG/main/docs/LightRAG-API-Server.md
4. LightRAG project page: https://lightrag.github.io
5. arXiv paper: https://arxiv.org/abs/2410.05779
6. Neon pgvector extension: https://neon.com/docs/extensions/pgvector

## Verification Notes

- All storage backend types and defaults confirmed from official `ProgramingWithCore.md`.
- PostgreSQL 16.6+ requirement confirmed from official docs.
- pgvector support on Neon confirmed from Neon's official documentation.
- Apache AGE support on Neon **could not be confirmed** — disclosed as a limitation; `PGTableGraphStorage` is the AGE-free alternative.
- The `StorageTypesSupported.md` page was not found at the expected path (404), but equivalent information was obtained from `ProgramingWithCore.md` and `LightRAG-API-Server.md`.

## V2 final response

# LightRAG Storage Options — Technical Report

**Prepared:** 2026-11-07 | **Scope:** Official LightRAG documentation and source code only

---

## 1. Official documentation and repository

| Item | Value |
|---|---|
| **Official repository** | https://github.com/hkuds/lightrag (HKUDS/LightRAG — public, not a fork; "[EMNLP2025] LightRAG: Simple and Fast Retrieval-Augmented Generation") |
| **Package** | `lightrag-hku` on PyPI (`pip install lightrag-hku`) |
| **Official images** | `ghcr.io/hkuds/lightrag` (signed with Cosign) |
| **Documentation** | No separate docs website. Official documentation lives in the repository's `docs/` folder (Markdown): `ProgramingWithCore.md`, `DockerDeployment.md`, `MilvusConfigurationGuide.md`, `LightRAG-API-Server.md`, `AppleContainerSetup.md`. |
| **Project page** | https://lightrag.github.io — HKU publication page for the paper; links to GitHub as "Code" but is not operational documentation. |

**Key docs used (raw GitHub, `main` branch):**
- `docs/ProgramingWithCore.md` — constructor storage parameters and supported backend list
- `docs/DockerDeployment.md` — PostgreSQL image policy (AGE vs pgvector), `PGTableGraphStorage` recommendation
- `docs/AppleContainerSetup.md` — reference Postgres/Neo4j/Milvus stack images
- `docs/LightRAG-API-Server.md` — env configuration, workspace isolation, storage migration limits, writer upgrade protocol
- `docs/MilvusConfigurationGuide.md` — Milvus index configuration
- `lightrag/kg/postgres_impl.py` — PostgreSQL storage implementation (asyncpg, SSL, prepared-statement cache, AGE gating)
- `lightrag/kg/factory.py` — storage class resolution

---

## 2. Supported storage backends

LightRAG abstracts four pluggable storage roles via constructor parameters (`kv_storage`, `vector_storage`, `graph_storage`, `doc_status_storage`) and env vars (`LIGHTRAG_KV_STORAGE`, etc.). Defaults are file-based and intended for single-user development.

**Source:** `docs/ProgramingWithCore.md` "LightRAG Init Parameters" table; `docs/LightRAG-API-Server.md` "Data Isolation Between LightRAG Instances"; `lightrag/kg/factory.py`.

### 2.1 Key-value storage (documents and text chunks)

| Backend | Class | Default | Workspace isolation |
|---|---|---|---|
| JSON files | `JsonKVStorage` | ✅ | `WORKING_DIR` subdirectory per workspace |
| PostgreSQL | `PGKVStorage` | | `POSTGRES_WORKSPACE` (table `workspace` column) |
| Redis | `RedisKVStorage` | | `REDIS_WORKSPACE` (collection prefix) |
| MongoDB | `MongoKVStorage` | | `MONGODB_WORKSPACE` (collection prefix) |
| OpenSearch | `OpenSearchKVStorage` | | `OPENSEARCH_WORKSPACE` (index prefix; ≥ 3.3.0 required) |

### 2.2 Vector storage (embedding vectors)

| Backend | Class | Default | Workspace isolation |
|---|---|---|---|
| NanoVectorDB (local file) | `NanoVectorDBStorage` | ✅ | `WORKING_DIR` subdirectory per workspace |
| PostgreSQL + pgvector | `PGVectorStorage` | | `POSTGRES_WORKSPACE`; `CREATE EXTENSION vector`; index types HNSW/IVFFLAT/VCHORDRQ/HNSW_HALFVEC |
| Milvus | `MilvusVectorDBStorage` | | `MILVUS_WORKSPACE`; `MILVUS_DB_NAME`; index config via `vector_db_storage_cls_kwargs` |
| Chroma | `ChromaVectorDBStorage` | | |
| Faiss (local file) | `FaissVectorDBStorage` | | `WORKING_DIR` subdirectories |
| MongoDB | `MongoVectorDBStorage` | | `MONGODB_WORKSPACE` |
| Qdrant | `QdrantVectorDBStorage` | | `QDRANT_WORKSPACE` (payload filtering on shared collections) |
| OpenSearch | `OpenSearchVectorDBStorage` | | `OPENSEARCH_WORKSPACE` (≥ 3.3.0) |

### 2.3 Graph storage (entities and relationships)

| Backend | Class | Default | Workspace isolation |
|---|---|---|---|
| NetworkX (local file) | `NetworkXStorage` | ✅ | `WORKING_DIR` subdirectory; single-writer contract |
| Neo4j | `Neo4JStorage` | | `NEO4J_WORKSPACE` (graph labels) |
| PostgreSQL + Apache AGE | `PGGraphStorage` | | `POSTGRES_WORKSPACE`; requires AGE extension; AGE ≥ 1.8.0 gated behind `POSTGRES_AGE_ALLOW_UNSUPPORTED_VERSION` |
| PostgreSQL tables | `PGTableGraphStorage` | | `POSTGRES_WORKSPACE`; no extension required — documented as the recommended Postgres graph storage |
| Apache AGE (direct) | `AGEStorage` | | Requires AGE extension |
| OpenSearch | `OpenSearchGraphStorage` | | `OPENSEARCH_WORKSPACE` (≥ 3.3.0) |
| Memgraph | `MemgraphStorage` | | `MEMGRAPH_WORKSPACE` (graph labels) |

### 2.4 Document status storage (ingestion pipeline status)

| Backend | Class | Default | Workspace isolation |
|---|---|---|---|
| JSON files | `JsonDocStatusStorage` | ✅ | `WORKING_DIR` subdirectory per workspace |
| PostgreSQL | `PGDocStatusStorage` | | `POSTGRES_WORKSPACE` (table `workspace` column) |
| MongoDB | `MongoDocStatusStorage` | | `MONGODB_WORKSPACE` |
| OpenSearch | `OpenSearchDocStatusStorage` | | `OPENSEARCH_WORKSPACE` (≥ 3.3.0) |
| Redis | `RedisDocStatusStorage` | | `REDIS_WORKSPACE` (referenced in server docs; all five built-in doc_status backends have full capabilities) |

---

## 3. Differences between the available storage options

### 3.1 Operational model

- **File-based defaults** (`Json*`, `NetworkXStorage`, `NanoVectorDBStorage`, `FaissVectorDBStorage`): zero external dependencies, data lives in `WORKING_DIR` (`./rag_storage` by default). Workspace isolation via subdirectories. Not safe for concurrent writers — NetworkX has a single-writer contract where graph admin edits defer pipeline starts. Suitable for development, single-user, or embedded use only.
- **External databases**: require provisioning and connection configuration, but support concurrent instances, workspace isolation inside the database, and production backup/recovery patterns.

### 3.2 Workspace isolation (multi-instance)

| Category | Mechanism | Backends |
|---|---|---|
| File subdirectories | `WORKING_DIR/<workspace>/...` | JsonKV, JsonDocStatus, NetworkX, NanoVectorDB, Faiss |
| Collection prefix | workspace prefixed to collection name | RedisKV/DocStatus, Milvus, MongoKV/Vector/DocStatus/Graph, PGGraph |
| Payload filtering | shared collections + payload filter | Qdrant |
| Workspace column | logical `workspace` field in tables | PGKV, PGVector, PGDocStatus |
| Graph labels | labels | Neo4j, Memgraph |
| Index prefixes | index name prefixes | OpenSearch (all four roles) |

Default workspaces: PostgreSQL = `default`, Neo4j = `base` when none configured.

### 3.3 Scalability and concurrency

- PostgreSQL backends use an asyncpg connection pool with configurable `max_connections`, connection retry/backoff, and batch-size limits for upserts/deletes (`POSTGRES_UPSERT_MAX_PAYLOAD_BYTES`, `POSTGRES_UPSERT_MAX_RECORDS_PER_BATCH`, `POSTGRES_DELETE_MAX_RECORDS_PER_BATCH`).
- Milvus is a dedicated vector database with its own etcd + MinIO stack; index parameters tunable via `vector_db_storage_cls_kwargs` or env vars.
- Redis is in-memory; appropriate for KV/doc-status but not durable by default unless configured.
- OpenSearch covers all four roles but requires version ≥ 3.3.0 for the v1.5 storage path.

### 3.4 Migration constraint

Direct migration between storage implementations is **not supported**, with one exception: an already-extracted graph can be moved from `PGGraphStorage` to `PGTableGraphStorage` without re-indexing. Otherwise, changing storage backends requires clearing data and re-indexing. The same applies to changing the embedding model, dimension, or asymmetric-embedding settings — vector semantics change, so affected workspace/vector data must be cleared and re-indexed.

---

## 4. Is PostgreSQL/Neon a suitable storage setup?

### 4.1 PostgreSQL — yes, for three of four roles natively, all four with caveats

LightRAG's PostgreSQL implementation (`lightrag/kg/postgres_impl.py`) uses **asyncpg** with a connection pool and supports:

- `PGKVStorage`, `PGVectorStorage`, `PGDocStatusStorage` — no extensions beyond pgvector for vectors
- `PGTableGraphStorage` — graph in ordinary indexed tables, **no extension required** (this is the documented recommendation over `PGGraphStorage`)
- `PGGraphStorage` — requires the **Apache AGE** extension; the reference Docker image `gzdaniel/postgres-for-rag:pg18-age-pgvector` bundles AGE + pgvector on Postgres 18. AGE ≥ 1.8.0 is treated as unsupported by LightRAG unless explicitly allowed via env var.
- SSL: `POSTGRES_SSL_MODE` (`require`, `prefer`, `verify-ca`, `verify-full`) plus client cert/CA config — required for managed Postgres.
- `statement_cache_size` — controls asyncpg's prepared-statement cache (critical for pooled connections).
- `server_settings` — extra connection options (e.g. for Supabase Supavisor/pgbouncer).
- Connection retry: `POSTGRES_CONNECTION_RETRIES`, `POSTGRES_CONNECTION_RETRY_BACKOFF`, `POSTGRES_CONNECTION_RETRY_BACKOFF_MAX`, `POSTGRES_POOL_CLOSE_TIMEOUT`.
- `CREATE EXTENSION IF NOT EXISTS vector` is attempted at bootstrap; failure is logged as a warning — pgvector availability must be verified.

The Docker deployment doc recommends the official `pgvector/pgvector:pg18` image when AGE is not needed, and notes PostgreSQL data file formats are incompatible across major versions (no in-place major-version rollback).

### 4.2 Neon (serverless PostgreSQL) — conditionally suitable, not officially documented

**LightRAG's documentation does not mention Neon at all.** Neon compatibility is inferred from Neon's public behavior (wire-compatible Postgres, SSL required, PgBouncer pooled endpoint, no superuser, no custom C extensions, pgvector available) combined with LightRAG's PostgreSQL config surface. It should be validated with a staging deployment before production use.

| Concern | Assessment |
|---|---|
| Wire compatibility | Neon is Postgres-compatible; asyncpg connects normally. |
| SSL | Neon requires SSL; LightRAG supports `POSTGRES_SSL_MODE=require`. ✅ |
| Pooled endpoint (PgBouncer, transaction mode) | asyncpg prepared statements break behind PgBouncer unless `statement_cache_size=0`. LightRAG exposes `statement_cache_size`, so this is configurable. ✅ (must be set) |
| pgvector | Neon supports pgvector; `PGVectorStorage` should work if the `vector` extension is available in the project. ⚠️ verify extension availability |
| Apache AGE | Neon does **not** support custom C extensions → `PGGraphStorage`/`AGEStorage` **not usable** on Neon. Use `PGTableGraphStorage` instead. ❌ for AGE |
| Scale-to-zero | Cold starts on idle; LightRAG's connection retry logic mitigates transient failures. ⚠️ latency on first request after idle |
| Superuser/extensions | No superuser; `CREATE EXTENSION vector` only works if Neon offers it in that project. |

**Verdict:** Neon is suitable for `PGKVStorage`, `PGDocStatusStorage`, `PGVectorStorage`, and `PGTableGraphStorage` (with `statement_cache_size=0` on the pooled endpoint and SSL `require`). It is **not suitable** for `PGGraphStorage` (AGE unavailable). For graph on Neon-backed stacks, use `PGTableGraphStorage` or a separate graph store (Neo4j/Memgraph).

---

## 5. Compatibility limitations and important configuration considerations

1. **No cross-backend migration.** Pick storage before the first upload; changing backends or embedding model/dimension/prefixes requires clearing workspace/vector data and re-indexing. Exception: `PGGraphStorage` → `PGTableGraphStorage` graph migration without re-indexing.
2. **Embedding dimension is fixed at table creation** for PostgreSQL vector storage; changing the embedding model requires re-indexing (`lightrag-rebuild-vdb` rebuilds vectors from graph + text chunks without touching the data directory).
3. **Shared-storage upgrade protocol:** when multiple LightRAG instances share PostgreSQL/Redis in one workspace, stop **all** old writers before starting a new version (rolling restarts with mixed versions corrupt the scheduling state). Workspaces must differ between instances sharing one database.
4. **OpenSearch version:** v1.5 storage path requires OpenSearch ≥ 3.3.0; older clusters must be upgraded first.
5. **Postgres major-version lock:** data files are incompatible across PostgreSQL major versions (relevant to the `pg18` Docker image).
6. **Neon-specific:** set `statement_cache_size=0` if using Neon's pooled (PgBouncer) endpoint; use `POSTGRES_SSL_MODE=require`; avoid `PGGraphStorage`; size the connection pool against Neon's connection limits; expect scale-to-zero cold starts.
7. **Authentication:** the server runs with no auth unless `AUTH_ACCOUNTS` or `LIGHTRAG_API_KEY` is set; binding to `0.0.0.0` without auth is unsafe.
8. **API docs:** `/docs`, `/redoc`, `/openapi.json` should be disabled (`ENABLE_API_DOCS=false`) in hardened production.

---

## 6. Recommended production storage architecture for an AI agent

For a production AI agent (multiple concurrent agent workers, shared knowledge base, document ingestion pipeline, graph + vector retrieval):

### Recommended stack

| Role | Backend | Rationale |
|---|---|---|
| Key-value (docs/chunks) | `PGKVStorage` on PostgreSQL | Single operational surface, durable, workspace column isolation |
| Document status | `PGDocStatusStorage` on PostgreSQL | Same DB, strict pipeline capabilities, transactional status transitions |
| Vector | `PGVectorStorage` (pgvector, HNSW index) | Simplest single-DB option; switch to `MilvusVectorDBStorage` only if vector scale/throughput outgrows Postgres |
| Graph | `PGTableGraphStorage` | No AGE extension, works on any Postgres including managed/Neon; documented as the recommended Postgres graph storage |
| Alternative graph (graph-heavy workloads) | Neo4j or Memgraph | Native graph, label-based workspace isolation; reference stack runs `neo4j:5-community` |

### Deployment pattern

- **Single PostgreSQL 18 instance** with pgvector, serving all four LightRAG roles; one database, multiple workspaces via `POSTGRES_WORKSPACE` per agent instance.
- **Connection pool:** tune `max_connections` per instance; use a connection pooler (PgBouncer/Neon pooled endpoint) with `statement_cache_size=0` if the pooler is in transaction mode.
- **SSL:** `POSTGRES_SSL_MODE=require` (or `verify-full` with CA).
- **Retries:** enable `POSTGRES_CONNECTION_RETRIES` with exponential backoff for transient failures (scale-to-zero cold starts, network blips).
- **One `.env` per agent instance**, unique `WORKSPACE` + port if multiple instances share a host/database; never run mixed LightRAG versions against the same storage/workspace simultaneously (stop all writers before upgrade).
- **Embedding:** fix `EMBEDDING_MODEL` + `EMBEDDING_DIM` before first upload; pin the model; re-index on any change.
- **Backups:** PostgreSQL logical/physical backups cover KV, vector, graph, and doc status in one place; Milvus (if used) needs its own etcd/MinIO backup procedure.
- **Observability:** `/health` endpoint reports storage capabilities; set `PIPELINE_REQUIRE_STRICT_STORAGE_READS=true` to fail startup if a backend lacks strict-read capabilities rather than degrading quietly.
- **Security:** `AUTH_ACCOUNTS`/`LIGHTRAG_API_KEY`, bind to `127.0.0.1` or behind a reverse proxy with TLS, disable API docs in production, Nginx `client_max_body_size` tuned for uploads.

### When to diverge

- **Very large vector corpora / high QPS ANN:** replace `PGVectorStorage` with `MilvusVectorDBStorage` (dedicated Milvus stack: `milvusdb/milvus:v2.6.11` + etcd + MinIO per the reference Apple Container setup).
- **Complex multi-hop graph queries at scale:** replace `PGTableGraphStorage` with `Neo4JStorage` (Neo4j 5 community) or `MemgraphStorage`.

---

## Sources

1. Repository: https://github.com/hkuds/lightrag
2. Storage options table: https://raw.githubusercontent.com/HKUDS/LightRAG/main/docs/ProgramingWithCore.md
3. Docker/PostgreSQL deployment: https://raw.githubusercontent.com/HKUDS/LightRAG/main/docs/DockerDeployment.md
4. Reference Postgres/Neo4j/Milvus stack: https://raw.githubusercontent.com/HKUDS/LightRAG/main/docs/AppleContainerSetup.md
5. Server env config, workspaces, migration limits: https://raw.githubusercontent.com/HKUDS/LightRAG/main/docs/LightRAG-API-Server.md
6. Milvus configuration: https://raw.githubusercontent.com/HKUDS/LightRAG/main/docs/MilvusConfigurationGuide.md
7. PostgreSQL implementation (asyncpg, SSL, statement cache, AGE gating): https://raw.githubusercontent.com/HKUDS/LightRAG/main/lightrag/kg/postgres_impl.py
8. Storage factory: https://raw.githubusercontent.com/HKUDS/LightRAG/main/lightrag/kg/factory.py
9. Env reference: https://raw.githubusercontent.com/HKUDS/LightRAG/main/env.example
10. Project page: https://lightrag.github.io

---

## What could not be verified

- **Neon is not mentioned anywhere in LightRAG's official docs or source.** Neon compatibility above is inferred from Neon's public behavior (SSL-required Postgres, PgBouncer pooling, no custom extensions, pgvector support) and LightRAG's PostgreSQL config surface. It should be validated with a staging deployment before production use.
- Exact environment-variable names for some PostgreSQL settings were observed in the source code and secondary references; the full `env.example` was partially truncated during retrieval, so a handful of PG env var names rely on the source code rather than a complete env.example read.

## Human evaluation (0–5 each)

| Dimension | V1 | V2 |
|---|---:|---:|
| Planning quality | pending | pending |
| Research completeness | pending | pending |
| Evidence quality | pending | pending |
| Failure recovery | pending | pending |
| Execution efficiency | pending | pending |
| Final report quality | pending | pending |
| Progress accuracy | pending | pending |

## Limitations

- This is one scenario/run per version; it is an observed comparison, not a statistically conclusive benchmark.
- Both runs use the same configured model and API credentials, but provider-side nondeterminism and rate limits can affect results.
- V1 emits legacy progress events; V2 additionally emits structured Orchestra events. Their event counts are not directly equivalent.
- A completed workflow does not prove every factual claim is correct; inspect the source links in each answer.
- The benchmark database is isolated from production. LightRAG is disabled for this research-only scenario.

## Raw traces

- V1: `v1/benchmarks/results/run.json` (also retained as an Actions artifact)
- V2: `benchmarks/results/run.json`
