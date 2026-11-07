# NallyHermes V1 vs V2 Orchestra Benchmark

## Run metadata

| Field | V1 | V2 |
|---|---|---|
| Commit | 4ba2b87084a4b003331e0f9c687bbf0822558edd | ddfab7b0f17c67c79186d8af5f7ae47df4842c5a |
| Model | nvidia/nemotron-3.5-super-vl-120b-a12b | nvidia/nemotron-3.5-super-vl-120b-a12b |
| Status | completed | completed |

## Execution metrics

| Metric | V1 | V2 | V2 vs V1 |
|---|---:|---:|---:|
| Duration (ms) | 137633 | 210157 | 52.7% |
| Progress events | 78 | 68 | -12.8% |
| Tool calls started | 18 | 15 | -16.7% |
| Tool errors | 2 | 0 | -100.0% |
| Retry events | 0 | 0 | n/a |
| Plan steps started | 3 | 4 | 33.3% |
| Plan steps completed | 3 | 4 | 33.3% |
| Plan steps failed | 0 | 0 | n/a |

> Lower is not always better: fewer tool calls or events can mean efficiency, but can also mean incomplete work. Interpret metrics alongside the reports and event traces.

## V1 final response

# LightRAG Storage Options — Technical Report

## 1. Official Documentation and Repository

| Item | Value | Source |
|------|-------|--------|
| **Official GitHub repository** | https://github.com/HKUDS/LightRAG | Official repo, maintained by HKUDS (Data Intelligence Lab, University of Hong Kong) |
| **PyPI package** | `lightrag-hku` | Listed in README |
| **Documentation site (paper/landing)** | https://lightrag.github.io | Official publication page (arXiv: 2410.05779) |
| **Detailed technical docs** | In-repo `docs/` folder (`LightRAG-API-Server.md`, `ProgramingWithCore.md`, `DockerDeployment.md`) | Linked from README |
| **API/Swagger docs** | Available at `/docs` on the running LightRAG server | GitHub Issue #2545 |

**Confirmed:** The `lightrag.github.io` site is a paper landing page, not a hosted documentation portal. The authoritative operational documentation lives in the GitHub repository's `docs/` directory and `README.md`.

---

## 2. Supported Storage Backends

LightRAG requires four storage types. The defaults (JSON files, NetworkX, NanoVectorDB) are in-memory with local file persistence and are explicitly not suitable for production.

### Key-Value Storage (LLM caches, chunks, extraction results)

| Backend | Class | Production-ready? |
|---------|-------|-------------------|
| JSON files (default) | `JsonKVStorage` | No — dev/testing only |
| PostgreSQL | `PGKVStorage` | Yes |
| Redis | `RedisKVStorage` | Yes |
| MongoDB | `MongoKVStorage` | Yes |
| OpenSearch | `OpenSearchKVStorage` | Yes |

### Vector Storage (embeddings for chunks, entities, relationships)

| Backend | Class | Production-ready? |
|---------|-------|-------------------|
| NanoVectorDB (default) | `NanoVectorDBStorage` | No — dev/testing only |
| PostgreSQL (pgvector) | `PGVectorStorage` | Yes |
| Milvus | `MilvusVectorDBStorage` | Yes |
| Chroma | `ChromaVectorDBStorage` | Yes |
| Faiss | `FaissVectorDBStorage` | Yes |
| MongoDB | `MongoVectorDBStorage` | Yes — Atlas Cloud only (vector search not on self-hosted Community Edition) |
| Qdrant | `QdrantVectorDBStorage` | Yes |
| OpenSearch | `OpenSearchVectorDBStorage` | Yes |

### Graph Storage (knowledge graph nodes and edges)

| Backend | Class | Production-ready? |
|---------|-------|-------------------|
| NetworkX (default) | `NetworkXStorage` | No — dev/testing only |
| Neo4j | `Neo4JStorage` | Yes |
| PostgreSQL (Apache AGE) | `PGGraphStorage` | Yes — requires Apache AGE extension |
| PostgreSQL (tables) | `PGTableGraphStorage` | Yes — pure PostgreSQL, no AGE needed |
| Apache AGE | `AGEStorage` | Yes — PostgreSQL graph extension |
| OpenSearch | `OpenSearchGraphStorage` | Yes |

### Document Status Storage (ingestion tracking)

| Backend | Class | Production-ready? |
|---------|-------|-------------------|
| JSON files (default) | `JsonDocStatusStorage` | No — dev/testing only |
| PostgreSQL | `PGDocStatusStorage` | Yes |
| MongoDB | `MongoDocStatusStorage` | Yes |
| OpenSearch | `OpenSearchDocStatusStorage` | Yes |

### Unified Backends (all four types in one database)

- **PostgreSQL** — recommended for production; can serve all four storage types on its own
- **MongoDB** — all-in-one option
- **OpenSearch** — all-in-one option

*Sources: README.md "Selecting Backend Storage" section; ProgramingWithCore.md init parameters table; LightRAG-API-Server.md.*

---

## 3. Differences Between Storage Options

### Default file-based vs. external databases
The default stack (`JsonKVStorage`, `NanoVectorDBStorage`, `NetworkXStorage`, `JsonDocStatusStorage`) keeps the entire dataset in the server process's RAM, with `WORKING_DIR` files serving only as persistence. Capacity is bounded by available RAM. These are intended only for small-scale testing, evaluation, and debugging — not production.

### PostgreSQL (unified backend)
**Pros:** Single database for all four storage types; mature operational tooling; ACID transactions; `pgvector` for vector similarity; `PGTableGraphStorage` avoids the Apache AGE dependency.

**Cons:** `PGGraphStorage` requires the Apache AGE extension (not available on all managed PostgreSQL offerings); vector dimension must be fixed at table creation time (changing embedding models requires clearing and re-indexing).

### Specialized vector databases (Milvus, Qdrant, Chroma, Faiss)
**Pros:** Purpose-built for vector similarity search; often better performance at large scale.

**Cons:** Only cover vector storage; you still need separate backends for KV, graph, and doc-status; more infrastructure to operate.

### Neo4j (graph-only)
**Pros:** Native graph query (Cypher); excellent for complex graph traversal and multi-hop reasoning.

**Cons:** Graph storage only; separate backends needed for KV, vector, and doc-status; additional operational overhead.

### MongoDB (unified)
**Pros:** Single backend for all four types; simple setup (especially MongoDB Atlas).

**Cons:** Vector search only available on MongoDB Atlas Cloud (not self-hosted Community Edition); graph capabilities are document-based rather than native graph.

### OpenSearch (unified)
**Pros:** Single backend for all four types; combines full-text search, k-NN vector search, and document-based graph.

**Cons:** Graph traversal is less expressive than a native graph DB; requires OpenSearch 3.3.0+ for the v1.5 storage path.

---

## 4. Is PostgreSQL/Neon Suitable?

### PostgreSQL — Yes, recommended
LightRAG's documentation states that for production, PostgreSQL is the recommended backend — it can serve all four storage types on its own.

The PostgreSQL storage classes are:
- `PGKVStorage` — key-value
- `PGVectorStorage` — vectors (requires `pgvector` extension; HNSW or IVFFlat index)
- `PGGraphStorage` — graph (requires Apache AGE extension)
- `PGTableGraphStorage` — graph (pure PostgreSQL tables, no AGE needed)
- `PGDocStatusStorage` — document status

### Neon (serverless PostgreSQL)
Neon is a serverless PostgreSQL provider that is PostgreSQL-protocol compatible.

**Confirmed:** Neon supports the pgvector extension (`CREATE EXTENSION IF NOT EXISTS vector;`), so LightRAG's `PGVectorStorage` works on Neon.

**Uncertain / likely unavailable:** Apache AGE was not confirmed as available on Neon. Neon's documentation states it supports "a large number of Postgres extensions" but cannot guarantee every one. Implication: `PGGraphStorage` and `AGEStorage` (which require Apache AGE) may not work on Neon. Use `PGTableGraphStorage` instead — it is pure PostgreSQL and needs no extensions.

**Neon-specific operational considerations:**
- **pgvector:** Available ✓ — required for `PGVectorStorage`.
- **Apache AGE:** Not confirmed — avoid `PGGraphStorage`/`AGEStorage`; use `PGTableGraphStorage`.
- **Serverless scale-to-zero:** Neon scales compute to zero after inactivity. Cold starts add latency to the first request after idle periods — a concern for a production AI agent handling user queries. Consider always-on compute or disabling autoscaling.
- **Connection pooling:** Neon provides a built-in PgBouncer-based pooler; tune `POSTGRES_MAX_CONNECTIONS` accordingly.

**Verdict:** Neon is suitable for LightRAG if you use `PGTableGraphStorage` and account for serverless cold-start latency. For a production AI agent with consistent query traffic, a non-serverless PostgreSQL (or Neon with always-on compute) may be more predictable.

---

## 5. Compatibility Limitations and Configuration Considerations

### Critical limitations
1. **No direct storage migration.** You cannot migrate data between different storage implementations (e.g., JSON → PostgreSQL) except for one exception: an already-extracted graph can be moved from `PGGraphStorage` to `PGTableGraphStorage` without re-indexing. All other switches require re-ingesting documents.
2. **Embedding model and dimension are immutable after indexing.** Changing them requires clearing vector data and re-indexing all documents. LightRAG provides `lightrag-rebuild-vdb` to rebuild vector storage from the existing graph and text chunks (without re-running LLM extraction), but you must not delete the working directory.
3. **Default file-based storages** (`JsonKVStorage`, `NanoVectorDBStorage`, `NetworkXStorage`, `JsonDocStatusStorage`) are dev-only — not production-suitable.
4. **Workspace isolation varies by backend:**
   - File-based: workspace subdirectories
   - Collection-based (Redis, Milvus, MongoDB, Neo4j, Memgraph, PGGraphStorage): workspace prefix on collection names
   - Relational (PGKVStorage, PGVectorStorage, PGDocStatusStorage): `workspace` column in tables
   - Qdrant: payload-based partitioning
   - OpenSearch: index name prefixes
   - Default workspace: `default` for PostgreSQL, `base` for Neo4j
5. **Authentication is required for network exposure.** Without `LIGHTRAG_API_KEY` or `AUTH_ACCOUNTS`, every endpoint is publicly accessible. Only safe on `127.0.0.1`.
6. **Gunicorn + Uvicorn production mode is not supported on Windows.**
7. **OpenSearch version requirement:** OpenSearch 3.3.0+ is required for the v1.5 storage path; older clusters must be upgraded first.
8. **pgvector index type:** Choose HNSW (better recall, more memory) or IVFFlat (faster build, lower recall) via `POSTGRES_VECTOR_INDEX_TYPE`.

### LightRAG PostgreSQL configuration
Required environment variables:
```
POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DATABASE, POSTGRES_HOST, POSTGRES_PORT
```

Optional tuning variables:
```
POSTGRES_MAX_CONNECTIONS=12          # default 12
POSTGRES_WORKSPACE=<name>            # workspace isolation
POSTGRES_VECTOR_INDEX_TYPE=HNSW      # or IVFFlat
POSTGRES_HNSW_M=16
POSTGRES_HNSW_EF=200
POSTGRES_IVFFLAT_LISTS=100
```

Production storage selection (all four in PostgreSQL):
```
LIGHTRAG_KV_STORAGE=PGKVStorage
LIGHTRAG_VECTOR_STORAGE=PGVectorStorage
LIGHTRAG_GRAPH_STORAGE=PGTableGraphStorage
LIGHTRAG_DOC_STATUS_STORAGE=PGDocStatusStorage
```

---

## 6. Recommended Production Storage Architecture

### Recommended: Unified PostgreSQL stack

For a production AI agent, I recommend a **unified PostgreSQL backend** with `PGTableGraphStorage` (to avoid the Apache AGE dependency), optionally supplemented by a specialized vector database if vector search volume is very high.

#### Minimal production configuration (single PostgreSQL)

```env
# Storage backends (all four in PostgreSQL)
LIGHTRAG_KV_STORAGE=PGKVStorage
LIGHTRAG_VECTOR_STORAGE=PGVectorStorage
LIGHTRAG_GRAPH_STORAGE=PGTableGraphStorage
LIGHTRAG_DOC_STATUS_STORAGE=PGDocStatusStorage

# PostgreSQL connection
POSTGRES_HOST=<your-postgres-host>
POSTGRES_PORT=5432
POSTGRES_USER=<user>
POSTGRES_PASSWORD=<password>
POSTGRES_DATABASE=lightrag
POSTGRES_MAX_CONNECTIONS=20
POSTGRES_WORKSPACE=production

# Vector configuration
POSTGRES_VECTOR_INDEX_TYPE=HNSW
POSTGRES_HNSW_M=16
POSTGRES_HNSW_EF=200

# Security
LIGHTRAG_API_KEY=<secure-key>
WHITELIST_PATHS=/health

# Embedding (choose before first indexing; cannot change later)
EMBEDDING_BINDING=openai
EMBEDDING_MODEL=text-embedding-3-large
EMBEDDING_DIM=3072
```

#### Alternative: Hybrid (PostgreSQL + specialized vector DB)

If vector search is the dominant workload and you need maximum vector performance:

```env
LIGHTRAG_KV_STORAGE=PGKVStorage
LIGHTRAG_VECTOR_STORAGE=MilvusVectorDBStorage   # or QdrantVectorDBStorage
LIGHTRAG_GRAPH_STORAGE=PGTableGraphStorage
LIGHTRAG_DOC_STATUS_STORAGE=PGDocStatusStorage
```

This trades operational complexity (two databases) for vector search performance.

#### Deployment checklist
1. **Choose storage backends before the first upload** — no migration path exists afterward.
2. **Fix the embedding model and dimension before indexing** — changes require re-indexing.
3. **Enable authentication** (`LIGHTRAG_API_KEY` or `AUTH_ACCOUNTS`) before exposing to any network.
4. **Use Gunicorn + Uvicorn** for production (Linux only).
5. **Configure connection pooling** (`POSTGRES_MAX_CONNECTIONS`) appropriate to your deployment mode.
6. **Set up workspace isolation** if running multiple LightRAG instances against the same database.
7. **Monitor vector index health** — HNSW vs. IVFFlat trade-offs; tune `POSTGRES_HNSW_M`/`POSTGRES_HNSW_EF` based on recall vs. latency needs.
8. **Plan for embedding model changes** — keep `lightrag-rebuild-vdb` in your operational runbook.

---

## Sources

1. **Official Repository:** https://github.com/HKUDS/LightRAG
2. **README.md (storage section):** https://raw.githubusercontent.com/HKUDS/LightRAG/main/README.md
3. **LightRAG-API-Server.md:** https://raw.githubusercontent.com/HKUDS/LightRAG/main/docs/LightRAG-API-Server.md
4. **ProgramingWithCore.md (init parameters table):** https://raw.githubusercontent.com/HKUDS/LightRAG/main/docs/ProgramingWithCore.md
5. **env.example (PostgreSQL config reference):** https://huggingface.co/atad-tokyo/GST_LIVING_NOVEL/blob/cc2aa1f775bb0b193703e6b2c3fc62b9e0411194/LightRAG/env.example and https://dev.to/aairom/hands-on-experience-with-lightrag-3hje
6. **PostgreSQL demo example:** https://github.com/HKUDS/LightRAG/blob/main/examples/lightrag_gemini_postgres_demo.py
7. **Neon documentation:** https://neon.tech (serverless PostgreSQL, pgvector support, connection pooling)
8. **Neo4j + LightRAG:** https://neo4j.com/blog/developer/under-the-covers-with-lightrag-extraction
9. **GitHub Issue #2255:** PostgreSQL + Apache AGE production usage
10. **GitHub Issue #1072:** Storage solution comparison discussion

---

## Final Recommendation

**Use PostgreSQL as the unified storage backend for all four LightRAG storage types.** It is the only backend LightRAG explicitly recommends for production, it simplifies operations (one database to manage), and it supports workspace isolation natively via a `workspace` column. Use `PGTableGraphStorage` rather than `PGGraphStorage`/`AGEStorage` if deploying on Neon or any managed PostgreSQL that lacks the Apache AGE extension. If you are on Neon, be mindful of serverless cold-start latency and configure `POSTGRES_MAX_CONNECTIONS` with Neon's connection pooler in mind. Choose your embedding model and dimension before the first document upload — there is no migration path afterward.

## V2 final response

# LightRAG Storage Options — Technical Report

**Prepared:** 2026-11-07 (user local time, Africa/Lagos, GMT+1)  
**Status:** Complete — all six requested areas covered using official sources where available, with unverified claims explicitly labeled.

---

## 1. Official Documentation and Repository

| Item | Location |
|------|----------|
| Official GitHub repository | https://github.com/HKUDS/LightRAG (HKUDS / Data Intelligence Lab, University of Hong Kong; MIT licensed; EMNLP 2025 paper) |
| Official project page / paper site | https://lightrag.github.io |
| Documentation sources (Markdown) | https://github.com/HKUDS/LightRAG/tree/main/docs |
| Raw docs mirror | https://raw.githubusercontent.com/HKUDS/LightRAG/main/docs/ |

**Key storage-related docs:**
- `ProgramingWithCore.md` — storage backend class table and constructor parameters
- `DockerDeployment.md` — PostgreSQL/pgvector/Apache AGE deployment, image recommendations
- `LightRAG-API-Server.md` — storage env vars, workspace isolation, migration rules, OpenSearch version requirements
- `MilvusConfigurationGuide.md` — Milvus vector index tuning via `vector_db_storage_cls_kwargs`
- `env.example` — full list of storage-related environment variables

---

## 2. Supported Storage Backends

LightRAG Core (`LightRAG` class) accepts four independent storage plug-ins, selectable via constructor args (`kv_storage`, `vector_storage`, `graph_storage`, `doc_status_storage`) or env vars (`LIGHTRAG_KV_STORAGE`, `LIGHTRAG_VECTOR_STORAGE`, `LIGHTRAG_GRAPH_STORAGE`, `LIGHTRAG_DOC_STATUS_STORAGE`).

### Key-Value Storage (documents and text chunks)

| Backend class | Default? | Technology |
|---|---|---|
| `JsonKVStorage` | Yes | JSON files under `WORKING_DIR` |
| `PGKVStorage` | No | PostgreSQL |
| `RedisKVStorage` | No | Redis |
| `MongoKVStorage` | No | MongoDB |
| `OpenSearchKVStorage` | No | OpenSearch |

### Vector Storage (embedding vectors)

| Backend class | Default? | Technology |
|---|---|---|
| `NanoVectorDBStorage` | Yes | Nano vector DB (file-based) |
| `PGVectorStorage` | No | PostgreSQL + pgvector |
| `MilvusVectorDBStorage` | No | Milvus |
| `ChromaVectorDBStorage` | No | Chroma |
| `FaissVectorDBStorage` | No | FAISS |
| `MongoVectorDBStorage` | No | MongoDB |
| `QdrantVectorDBStorage` | No | Qdrant |
| `OpenSearchVectorDBStorage` | No | OpenSearch |

### Graph Storage (entities and relationships)

| Backend class | Default? | Technology |
|---|---|---|
| `NetworkXStorage` | Yes | NetworkX (file-based, GraphML) |
| `Neo4JStorage` | No | Neo4j |
| `PGGraphStorage` | No | PostgreSQL + Apache AGE |
| `PGTableGraphStorage` | No | PostgreSQL tables (no extension) |
| `AGEStorage` | No | Apache AGE |
| `OpenSearchGraphStorage` | No | OpenSearch |

### Document Status Storage (ingestion/processing status)

| Backend class | Default? | Technology |
|---|---|---|
| `JsonDocStatusStorage` | Yes | JSON files |
| `PGDocStatusStorage` | No | PostgreSQL |
| `MongoDocStatusStorage` | No | MongoDB |
| `OpenSearchDocStatusStorage` | No | OpenSearch |
| `RedisDocStatusStorage` | No | Redis* |

* `RedisDocStatusStorage` is referenced in `LightRAG-API-Server.md` as one of five built-in doc-status backends (JSON, Redis, PostgreSQL, MongoDB, OpenSearch) but does not appear in the Core doc's storage table — treat as present but less prominently documented.

---

## 3. Differences Between the Available Storage Options

### File-based defaults vs server-backed

The four default backends (`JsonKVStorage`, `NanoVectorDBStorage`, `NetworkXStorage`, `JsonDocStatusStorage`) store everything under `WORKING_DIR` (default `./rag_storage`). They require zero infrastructure and are the getting-started configuration, but they are single-node, not safe for concurrent LightRAG instances, and explicitly not intended for production scale. All other backends are server-backed and required for multi-instance deployments.

### Workspace isolation differs per backend

- **File-based:** workspace subdirectories under `WORKING_DIR`
- **Redis / Milvus / MongoDB / OpenSearch / PGGraph:** workspace prefixes on collection/index/label names
- **Qdrant:** payload-based partitioning (shared collections, unlimited workspace scalability)
- **PostgreSQL KV/vector/doc-status:** a `workspace` column in tables
- **Neo4j / Memgraph:** labels

### Graph storage distinction

`PGGraphStorage` requires Apache AGE (the official Docker image `gzdaniel/postgres-for-rag:pg18-age-pgvector` bundles pgvector + AGE). `PGTableGraphStorage` stores the entity-relation graph in ordinary indexed PostgreSQL tables and needs no extension — the docs recommend it when AGE isn't otherwise needed. An already-extracted graph can be migrated from `PGGraphStorage` to `PGTableGraphStorage` without re-indexing; this is the **only** supported direct storage migration between backends.

### Vector storage semantics

Changing the embedding model, `EMBEDDING_DIM`, asymmetric embedding setting, or query/document prefixes changes vector space semantics — you must clear the affected workspace/vector data and re-index (or use the `lightrag-rebuild-vdb` tool to rebuild vectors from graph and text chunks without deleting the graph).

### Milvus specifics

`MilvusVectorDBStorage` accepts `vector_db_storage_cls_kwargs` covering 11 `MilvusIndexConfig` parameters (index type: AUTOINDEX/HNSW/HNSW_SQ/IVF_FLAT; metric: COSINE/L2/IP; HNSW M/ef_construction/ef; SQ quantization; IVF nlist/nprobe). Kwargs take priority over env vars, which take priority over defaults.

---

## 4. Is PostgreSQL / Neon a Suitable Storage Setup?

### PostgreSQL — Yes, officially supported

LightRAG officially supports PostgreSQL across all four storage roles:

| Storage Role | Backend Class | Extension Required |
|---|---|---|
| Key-Value | `PGKVStorage` | None (standard Postgres) |
| Vector | `PGVectorStorage` | `pgvector` |
| Graph | `PGTableGraphStorage` | None (ordinary indexed tables) |
| Graph | `PGGraphStorage` | Apache AGE |
| Doc Status | `PGDocStatusStorage` | None (standard Postgres) |

**Official Docker deployment** (`DockerDeployment.md`):
- Default image: `gzdaniel/postgres-for-rag:pg18-age-pgvector` — bundles pgvector + Apache AGE
- Alternative when AGE isn't needed: `pgvector/pgvector:pg18` (official pgvector image) — explicitly recommended when using `PGTableGraphStorage` or a non-Postgres graph backend
- Credentials via `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB`
- Workspace isolation via `POSTGRES_WORKSPACE` env var

**Important PostgreSQL limitations (from official docs):**
- **Major-version lock:** PostgreSQL data file formats are incompatible across major versions; once deployed, the image cannot be rolled back to an earlier version
- **Workspace isolation bug:** GitHub Issue #1927 documents critical per-instance workspace isolation problems with PostgreSQL storages when multiple LightRAG instances share one database (opened Aug 2025; collaborator acknowledged and planned a PR; issue marked closed — fix status not independently verified)
- **Migration constraint:** Storage must be chosen before first upload; direct migration between storage implementations is not supported (except `PGGraphStorage` → `PGTableGraphStorage`)

### Neon (serverless PostgreSQL) — Inferred compatible, not officially documented

**No official LightRAG documentation about Neon was found.** The following assessment is inferred from Neon's public documentation plus LightRAG's PostgreSQL connection-string design:

**What should work on Neon:**
- Neon supports the `pgvector` extension via `CREATE EXTENSION IF NOT EXISTS vector;` (confirmed in Neon's official pgvector docs)
- Neon is PostgreSQL-compatible, so `PGKVStorage`, `PGVectorStorage`, `PGDocStatusStorage`, and `PGTableGraphStorage` should connect via a standard PostgreSQL connection string
- `POSTGRES_WORKSPACE` can be used for workspace isolation (subject to the same caveat as self-hosted Postgres)

**What will NOT work on Neon:**
- `PGGraphStorage` requires Apache AGE, a custom C extension. Neon does not support custom C extensions and provides no superuser account (only `neon_superuser`). AGE-based graph storage is not expected to work on Neon — use `PGTableGraphStorage` or a separate Neo4j/Memgraph instead

**Neon-specific considerations (from Neon's own compatibility docs):**
- No tablespaces; no direct file system access
- No superuser role; uses `neon_superuser` instead
- Parameter differences (`shared_buffers`, `max_worker_processes` vary by compute size; `restart_after_crash` is off)
- Serverless compute with autoscaling and scale-to-zero — connection latency and pooling behavior under LightRAG's concurrent writers is unverified

---

## 5. Compatibility Limitations and Configuration Considerations

1. **Storage must be chosen before the first upload.** Direct migration between storage implementations is not supported (except graph: `PGGraphStorage` → `PGTableGraphStorage`). Switching later means re-indexing.
2. **Embedding changes require re-indexing.** Changing model, dimension, asymmetric embedding, or prefixes invalidates existing vectors; clear workspace/vector data and re-index, or use `lightrag-rebuild-vdb`.
3. **OpenSearch version:** OpenSearch clusters older than 3.3.0 must be upgraded before enabling the v1.5 storage path; new deployments should use OpenSearch 3.3.0+.
4. **PostgreSQL major-version lock:** Once deployed, the Postgres image cannot be rolled back to an earlier major version (data file format incompatibility).
5. **AGE dependency:** `PGGraphStorage` requires the AGE-bundled image; `PGTableGraphStorage` avoids this.
6. **Multi-worker upgrades:** When using shared external storage, stop all old writers before starting a new version against the same storage — rolling restarts with mixed versions can corrupt scheduling state.
7. **Authentication:** Without `AUTH_ACCOUNTS` or `LIGHTRAG_API_KEY`, the server runs unauthenticated — unsafe on `0.0.0.0`.
8. **Env var precedence:** System environment variables override `.env`; `.env` must live in the startup directory.
9. **Storage-specific workspace env vars:** `REDIS_WORKSPACE`, `MILVUS_WORKSPACE`, `QDRANT_WORKSPACE`, `MONGODB_WORKSPACE`, `POSTGRES_WORKSPACE`, `NEO4J_WORKSPACE`, `MEMGRAPH_WORKSPACE`, `OPENSEARCH_WORKSPACE` override the common `WORKSPACE`.

---

## 6. Recommended Production Storage Architecture

For a production AI agent built on LightRAG, I recommend a **hybrid server-backed stack** rather than the file-based defaults:

| Role | Recommended backend | Rationale |
|---|---|---|
| KV (chunks, cache) | `PGKVStorage` | Keeps all relational data in one operational DB; simple backups |
| Vector | `PGVectorStorage` (pgvector) **or** `MilvusVectorDBStorage` | pgvector for simplicity/colocation; Milvus if you need advanced ANN tuning at scale |
| Graph | `PGTableGraphStorage` | No AGE extension needed; fully Postgres-native; migratable from AGE graph |
| Doc status | `PGDocStatusStorage` | Same DB as KV, transactionally consistent ingestion tracking |

### Deployment pattern

One PostgreSQL instance (self-hosted, RDS, or Neon) with `pgvector` enabled, plus `PGTableGraphStorage` for the graph. Use distinct `POSTGRES_WORKSPACE` values (or separate databases/schemas) to isolate multiple LightRAG agents sharing the instance. Run LightRAG Server via Docker Compose (`ghcr.io/hkuds/lightrag`) with the official pgvector image or Neon as the DB service. Enable authentication (`AUTH_ACCOUNTS`/`LIGHTRAG_API_KEY` + `TOKEN_SECRET`), disable API docs in production (`ENABLE_API_DOCS=false`), and put Nginx/traefik TLS in front with `client_max_body_size` tuned for uploads.

### When to diverge

- **Heavy graph queries + existing Neo4j/Memgraph:** Use `Neo4JStorage`/`MemgraphStorage` for graph while keeping KV/vector/doc-status on Postgres.
- **Very large vector scale (millions of vectors, fine-tuned HNSW):** Prefer `MilvusVectorDBStorage` over pgvector.
- **Neon specifically:** Use `PGTableGraphStorage` (not `PGGraphStorage`, since AGE is unavailable). Consider connection pooling due to serverless scale-to-zero latency.
- **Avoid:** File-based defaults (`Json*`, `NanoVectorDBStorage`, `NetworkXStorage`) in production — single-node, not designed for concurrent instances.

---

## Sources

| # | Source | Type |
|---|--------|------|
| 1 | https://github.com/HKUDS/LightRAG | Official repository |
| 2 | https://github.com/HKUDS/LightRAG/tree/main/docs | Official docs folder |
| 3 | https://raw.githubusercontent.com/HKUDS/LightRAG/main/docs/ProgramingWithCore.md | Storage backend table (official) |
| 4 | https://raw.githubusercontent.com/HKUDS/LightRAG/main/docs/DockerDeployment.md | Postgres/AGE/pgvector deployment (official) |
| 5 | https://raw.githubusercontent.com/HKUDS/LightRAG/main/docs/LightRAG-API-Server.md | Storage env vars, workspaces, migration (official) |
| 6 | https://raw.githubusercontent.com/HKUDS/LightRAG/main/docs/MilvusConfigurationGuide.md | Milvus vector config (official) |
| 7 | https://raw.githubusercontent.com/HKUDS/LightRAG/main/env.example | Storage env var names (official) |
| 8 | https://github.com/HKUDS/LightRAG/issues/1927 | Postgres workspace isolation bug (official issue tracker) |
| 9 | https://neon.com/docs/extensions/pgvector | Neon pgvector support (Neon official docs) |
| 10 | https://neon.com/docs/reference/compatibility | Neon Postgres compatibility reference (Neon official docs) |

---

## Verification Notes

- All storage class names and defaults come directly from the official `ProgramingWithCore.md` table.
- PostgreSQL/AGE/pgvector details come from the official `DockerDeployment.md`.
- Redis doc-status storage is referenced in the official API Server doc (five built-in backends) but does not appear in the Core doc's storage table — listed with that caveat.
- No official LightRAG documentation about Neon was found; the Neon assessment is inferred from Neon's public pgvector support plus LightRAG's Postgres connection-string design, and is labeled as such rather than claimed as verified LightRAG guidance.
- GitHub Issue #1927 (Postgres workspace isolation) was opened Aug 2025 and marked closed; the fix status could not be independently verified from available sources.

**Final recommendation:** For production, deploy LightRAG against a single PostgreSQL instance with `pgvector` enabled, using `PGKVStorage` + `PGVectorStorage` + `PGTableGraphStorage` + `PGDocStatusStorage`, with `POSTGRES_WORKSPACE` for multi-agent isolation, authentication enabled, and file-based defaults avoided entirely. On Neon, substitute `PGTableGraphStorage` for graph (AGE unavailable) and add connection pooling for serverless latency.

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
