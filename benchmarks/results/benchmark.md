# NallyHermes V1 vs V2 Orchestra Benchmark

## Run metadata

| Field | V1 | V2 |
|---|---|---|
| Commit | 4ba2b87084a4b003331e0f9c687bbf0822558edd | 95ebcf046da6938b5a1d91a13237d450084adc8c |
| Model | nvidia/nemotron-3.5-super-vl-120b-a12b | nvidia/nemotron-3.5-super-vl-120b-a12b |
| Status | completed | completed |

## Execution metrics

| Metric | V1 | V2 | V2 vs V1 |
|---|---:|---:|---:|
| Duration (ms) | 204053 | 212411 | 4.1% |
| Model calls | not instrumented | 26 | n/a |
| Median input tokens / call | n/a | 6284 | n/a |
| Median output tokens / call | n/a | 251.5 | n/a |
| Median total tokens / call | n/a | 6561.5 | n/a |
| Model-call errors | not instrumented | 0 | n/a |
| Model turns with tool calls | not instrumented | 24 | n/a |
| Tool calls requested by model | not instrumented | 44 | n/a |
| Progress events | 68 | 152 | 123.5% |
| Tool calls started | 15 | 38 | 153.3% |
| Tool errors | 0 | 0 | n/a |
| Retry events | 0 | 0 | n/a |
| Plan steps started | 4 | 3 | -25.0% |
| Plan steps completed | 4 | 0 | -100.0% |
| Plan steps failed | 0 | 5 | n/a |

> Lower is not always better: fewer tool calls or events can mean efficiency, but can also mean incomplete work. Interpret metrics alongside the reports and event traces.

## V1 final response

# Technical Report: LightRAG Storage Backends

## Evidence Sufficiency

The research is complete. All four planned steps were executed successfully, and the collected evidence is sufficient to answer every part of your request. No further research steps remain pending. Claims below are drawn from official LightRAG sources (GitHub repository docs and the project site), with Neon-specific claims flagged where LightRAG documentation is silent.

---

## 1. Official Documentation and Repository

| Item | Value | Source |
|------|-------|--------|
| **Official Repository** | https://github.com/HKUDS/LightRAG | GitHub API, verified HTTP 200 |
| **Repository Owner** | HKUDS (The University of Hong Kong) | GitHub metadata |
| **Public / Non-fork** | Yes | GitHub metadata |
| **Description** | "[EMNLP2025] LightRAG: Simple and Fast Retrieval-Augmented Generation" | GitHub repository page |
| **Official Documentation Site** | https://lightrag.github.io | Project landing page |
| **Research Paper** | https://arxiv.org/abs/2410.05779 | Linked from official site |
| **Docker Image** | ghcr.io/hkuds/lightrag | docs/DockerDeployment.md |
| **PyPI Package** | `lightrag-hku` | docs/LightRAG-API-Server.md |

The primary storage documentation lives in `docs/ProgramingWithCore.md` (the "LightRAG Init Parameters" table) and `docs/LightRAG-API-Server.md` (deployment and production guidance). Supporting design docs include `docs/design/PgVectorFilteredSearch.md` and `docs/MilvusConfigurationGuide.md`.

---

## 2. Supported Storage Backends

LightRAG abstracts storage into four pluggable categories, selected via constructor parameters (or `LIGHTRAG_*_STORAGE` environment variables for the API server).

### 2.1 Key-Value Storage (`kv_storage`)

| Backend | Class Name | Default? | Notes |
|---------|-----------|----------|-------|
| JSON file | `JsonKVStorage` | **Yes** | Local file persistence; development only |
| PostgreSQL | `PGKVStorage` | No | Requires PostgreSQL |
| Redis | `RedisKVStorage` | No | Requires Redis |
| MongoDB | `MongoKVStorage` | No | Requires MongoDB |
| OpenSearch | `OpenSearchKVStorage` | No | Requires OpenSearch 3.3.0+ |

**Purpose:** LLM response caches, text chunking results, entity-relation extraction results, document information.

### 2.2 Vector Storage (`vector_storage`)

| Backend | Class Name | Default? | Notes |
|---------|-----------|----------|-------|
| NanoVectorDB | `NanoVectorDBStorage` | **Yes** | Local file-based; development only |
| PostgreSQL + pgvector | `PGVectorStorage` | No | Requires pgvector extension |
| Milvus | `MilvusVectorDBStorage` | No | Specialized vector DB |
| Chroma | `ChromaVectorDBStorage` | No | |
| Faiss | `FaissVectorDBStorage` | No | |
| MongoDB | `MongoVectorDBStorage` | No | |
| Qdrant | `QdrantVectorDBStorage` | No | Tenant-local search (workspace isolation via payload) |
| OpenSearch | `OpenSearchVectorDBStorage` | No | Requires OpenSearch 3.3.0+ |

**Purpose:** Embedding vectors for text chunks, entities, and relationships.

### 2.3 Graph Storage (`graph_storage`)

| Backend | Class Name | Default? | Notes |
|---------|-----------|----------|-------|
| NetworkX | `NetworkXStorage` | **Yes** | Local file-based; development only |
| Neo4j | `Neo4JStorage` | No | Specialized graph DB |
| PostgreSQL + Apache AGE | `PGGraphStorage` | No | Requires Apache AGE extension |
| PostgreSQL tables (pure SQL) | `PGTableGraphStorage` | No | No AGE required |
| Apache AGE | `AGEStorage` | No | AGE-based implementation |
| OpenSearch | `OpenSearchGraphStorage` | No | Requires OpenSearch 3.3.0+ |

**Purpose:** Entity-relation knowledge graph edges and nodes.

### 2.4 Document Status Storage (`doc_status_storage`)

| Backend | Class Name | Default? | Notes |
|---------|-----------|----------|-------|
| JSON file | `JsonDocStatusStorage` | **Yes** | Local file persistence; development only |
| PostgreSQL | `PGDocStatusStorage` | No | Requires PostgreSQL |
| MongoDB | `MongoDocStatusStorage` | No | Requires MongoDB |
| OpenSearch | `OpenSearchDocStatusStorage` | No | Requires OpenSearch 3.3.0+ |

**Purpose:** Document ingestion/processing status tracking.

### 2.5 Single-Backend Options (All Four Storage Types)

| Backend | KV | Vector | Graph | Doc Status |
|---------|----|--------|-------|------------|
| PostgreSQL | PGKVStorage | PGVectorStorage | PGGraphStorage / PGTableGraphStorage | PGDocStatusStorage |
| MongoDB | MongoKVStorage | MongoVectorDBStorage | MongoGraphStorage | MongoDocStatusStorage |
| OpenSearch | OpenSearchKVStorage | OpenSearchVectorDBStorage | OpenSearchGraphStorage | OpenSearchDocStatusStorage |

### 2.6 Community-Contributed (Not in Main Branch)

| Backend | Branch | Coverage | Status |
|---------|--------|----------|--------|
| LanceDB | `dev-lancedb` | All four types | Community-contributed; not official |
| Nebula Graph | `dev-nebula-graph` | Graph only | Community-contributed; not official |

These are **not** part of the official main release and are not listed in the core `LightRAG` init parameters.

---

## 3. Differences Between Available Storage Options

### Default (File-Based) Backends — Development Only

`JsonKVStorage`, `NanoVectorDBStorage`, `NetworkXStorage`, and `JsonDocStatusStorage` are the defaults. The documentation explicitly states these are **suitable only for small-scale testing and evaluation, not for production**. Data persists as local files under `working_dir` (default `./rag_storage`). They do not support concurrent multi-worker access, lack query optimization, and are vulnerable to file corruption.

### PostgreSQL (Unified Backend)

**Advantages:** Single database for all four storage types; ACID transactions; mature backup/replication tooling; `PGTableGraphStorage` avoids the Apache AGE extension requirement.

**Considerations:** `PGVectorStorage` requires the `pgvector` extension. `PGGraphStorage` requires Apache AGE (typically needs superuser to install). Workspace isolation is achieved via a `workspace` column in tables. For multi-workspace vector search, pgvector >= 0.8 with HNSW and `SET LOCAL hnsw.iterative_scan = strict_order` is required to avoid the "workspace filter after ANN index" defect.

### MongoDB

**Advantages:** Single backend for all four types; document-oriented; good for flexible schemas.

**Considerations:** Not as mature for graph traversal as dedicated graph databases; workspace isolation via collection-name prefix.

### OpenSearch

**Advantages:** Single backend for all four types; built-in full-text and vector search.

**Considerations:** Requires OpenSearch 3.3.0 or later (older clusters must be upgraded before enabling v1.5 storage path). Workspace isolation via index name prefixes.

### Specialized Vector Databases (Milvus, Qdrant, Chroma, Faiss)

**Milvus:** One collection per workspace (`{workspace}_{namespace}_{model_suffix}`), so no shared-index filtering defect. Supports HNSW, IVF_FLAT, HNSW_SQ quantization.

**Qdrant:** All workspaces in one collection with tenant-local HNSW graphs per workspace (`KeywordIndexParams(is_tenant=True)`). No shared-index defect; no scan budget needed. Best for many workspaces or uneven workspace sizes.

**Chroma / Faiss:** Listed as supported backends but with less documentation detail.

### Specialized Graph Databases (Neo4j, Memgraph)

**Neo4j:** Native graph database with Cypher query language. Workspace isolation via labels.

**Memgraph:** Mentioned in API server docs as a graph storage option. Workspace isolation via labels.

---

## 4. PostgreSQL / Neon Suitability Investigation

### Can PostgreSQL Serve All Four Storage Types?

**Yes.** PostgreSQL is the officially recommended single-backend option for production. All four LightRAG storage roles have PostgreSQL implementations:

| Role | PostgreSQL Backend | Extension Required |
|------|-------------------|-------------------|
| KV | `PGKVStorage` | None |
| Vector | `PGVectorStorage` | pgvector |
| Graph | `PGGraphStorage` or `PGTableGraphStorage` | Apache AGE (for PGGraphStorage); none (for PGTableGraphStorage) |
| Doc Status | `PGDocStatusStorage` | None |

### Is Neon Suitable?

| Requirement | Neon Compatibility | Confidence | Evidence |
|-------------|-------------------|------------|----------|
| PostgreSQL protocol compatibility | Yes | High | Neon is PostgreSQL-compatible |
| pgvector extension | Yes | High | Neon docs confirm `CREATE EXTENSION IF NOT EXISTS vector;` |
| Apache AGE extension | Likely No | Medium | AGE requires superuser; managed providers typically restrict; Neon community feature request exists |
| `PGTableGraphStorage` (no AGE) | Yes | High | Pure SQL, no extension needed |
| `PGKVStorage` / `PGDocStatusStorage` | Yes | High | Standard PostgreSQL tables |
| pgvector >= 0.8 + iterative scan | Unknown | Medium | Specific pgvector version on Neon not verified |

**Key finding:** Neon is suitable for LightRAG production **if you use `PGTableGraphStorage` for graph** (avoiding Apache AGE) and verify pgvector >= 0.8 for multi-workspace vector correctness. `PGGraphStorage` (Apache AGE) likely will not work on Neon.

### Evidence from Production Deployments

The Railway deployment template uses a custom PostgreSQL image with **pgvector + Apache AGE pre-built**, explicitly noting that "a stock Postgres won't provide graph storage" because `PGGraphStorage` runs on the AGE extension. GitHub issue #2255 confirms LightRAG initializing with `PGGraphStorage` + `AGE extension enabled` on PostgreSQL, with `EMBEDDING_DIM` matching the embedding model (e.g., 1024 for bge-m3).

---

## 5. Compatibility Limitations and Configuration Considerations

### 5.1 Embedding Model / Dimension Lock-In

- The embedding model, dimension, and asymmetric embedding settings must be chosen **before the first document upload**.
- Changing them later requires clearing affected vector data and re-indexing all source files (`lightrag-rebuild-vdb`).
- `EMBEDDING_DIM` must match the embedding model exactly, or indexing fails with a dimension mismatch.
- Changing parser routing (`LIGHTRAG_PARSER`) or chunker settings (`CHUNK_*`) affects only newly uploaded documents; existing documents must be deleted and re-uploaded.

### 5.2 No Direct Storage Migration

- Direct migration between storage implementations is **not supported**, with one exception: an already-extracted graph can be moved from `PGGraphStorage` to `PGTableGraphStorage` without re-indexing.
- Switching vector backends requires a full re-embedding (`lightrag-rebuild-vdb`); the other three stores are unaffected.

### 5.3 Workspace Isolation Varies by Backend

| Backend Type | Isolation Mechanism | Examples |
|-------------|-------------------|----------|
| Local file-based | Workspace subdirectories | JsonKVStorage, JsonDocStatusStorage, NetworkXStorage, NanoVectorDBStorage, FaissVectorDBStorage |
| Collection prefix | Workspace prefix on collection name | RedisKVStorage, MilvusVectorDBStorage, MongoKVStorage, MongoDocStatusStorage, MongoVectorDBStorage, MongoGraphStorage, PGGraphStorage |
| Payload filtering | Qdrant tenant indexes | QdrantVectorDBStorage |
| `workspace` column | Logical field in tables | PGKVStorage, PGVectorStorage, PGDocStatusStorage |
| Labels | Graph labels | Neo4JStorage, MemgraphStorage |
| Index prefixes | Index name prefixes | OpenSearchKVStorage, OpenSearchDocStatusStorage, OpenSearchGraphStorage, OpenSearchVectorDBStorage |

Storage-specific workspace env vars: `REDIS_WORKSPACE`, `MILVUS_WORKSPACE`, `QDRANT_WORKSPACE`, `MONGODB_WORKSPACE`, `POSTGRES_WORKSPACE`, `NEO4J_WORKSPACE`, `MEMGRAPH_WORKSPACE`, `OPENSEARCH_WORKSPACE`.

Default workspace: PostgreSQL = `default`, Neo4j = `base`.

### 5.4 PostgreSQL Vector Search Defect (Multi-Workspace)

When multiple workspaces share one vector table, the HNSW index is global and the workspace filter runs after the ANN search. Small workspaces may get zero results. Mitigation: pgvector >= 0.8 with `SET LOCAL hnsw.iterative_scan = strict_order` (adds 2–3 round trips per query). For many or unevenly-sized workspaces, Qdrant (tenant-local search) is the structural alternative.

### 5.5 OpenSearch Version Requirement

OpenSearch 3.3.0 or later is required for the v1.5 storage path. Older clusters must be upgraded first.

### 5.6 Concurrency / Multi-Worker

- File-backed stores (NetworkX, NanoVectorDB, JSON) are **not** safe for multiple Gunicorn workers or multiple instances sharing the same storage.
- PostgreSQL, Qdrant, and Milvus are fine with multiple workers.
- When upgrading the server, stop all old workers sharing the same storage and workspace before starting the new version (rolling restart with an old worker is a failure case).

### 5.7 PostgreSQL Environment Variables

```
POSTGRES_HOST, POSTGRES_PORT, POSTGRES_USER, POSTGRES_PASSWORD,
POSTGRES_DATABASE, POSTGRES_MAX_CONNECTIONS, POSTGRES_WORKSPACE
```

Storage selection env vars:
```
LIGHTRAG_KV_STORAGE=PGKVStorage
LIGHTRAG_VECTOR_STORAGE=PGVectorStorage
LIGHTRAG_GRAPH_STORAGE=PGGraphStorage (or PGTableGraphStorage)
LIGHTRAG_DOC_STATUS_STORAGE=PGDocStatusStorage
```

---

## 6. Recommended Production Storage Architecture

### Recommended: PostgreSQL-Unified Architecture (Single Database)

For most production AI agent deployments, a single PostgreSQL instance is the best balance of operational simplicity, capability, and official support:

| Role | Backend | Rationale |
|------|---------|-----------|
| KV | `PGKVStorage` | ACID, simple, no extra infrastructure |
| Vector | `PGVectorStorage` | pgvector with HNSW; single DB; pgvector >= 0.8 for multi-workspace correctness |
| Graph | `PGTableGraphStorage` | Pure PostgreSQL, no Apache AGE superuser requirement; works on managed/serverless PostgreSQL (e.g., Neon) |
| Doc Status | `PGDocStatusStorage` | ACID, simple, no extra infrastructure |

**Configuration:**
```env
LIGHTRAG_KV_STORAGE=PGKVStorage
LIGHTRAG_VECTOR_STORAGE=PGVectorStorage
LIGHTRAG_GRAPH_STORAGE=PGTableGraphStorage
LIGHTRAG_DOC_STATUS_STORAGE=PGDocStatusStorage
POSTGRES_HOST=<your-postgres-host>
POSTGRES_PORT=5432
POSTGRES_USER=<user>
POSTGRES_PASSWORD=<password>
POSTGRES_DATABASE=lightrag
POSTGRES_WORKSPACE=<workspace-name>
EMBEDDING_DIM=1024  # must match your embedding model (e.g., bge-m3)
```

**If using Neon specifically:** Use `PGTableGraphStorage` for graph (Apache AGE likely unavailable). Verify pgvector version >= 0.8 for correct multi-workspace vector search. If pgvector < 0.8 or iterative scan is unavailable, consider Qdrant for vector storage instead.

### Alternative: Split Architecture (For Scale or Specialized Needs)

If you have many workspaces, uneven workspace sizes, or need advanced graph capabilities:

| Role | Backend | Rationale |
|------|---------|-----------|
| KV | `PGKVStorage` or `RedisKVStorage` | Redis if you need sub-ms cache access |
| Vector | `QdrantVectorDBStorage` | Tenant-local HNSW per workspace; no shared-index defect; best for many/uneven workspaces |
| Graph | `Neo4JStorage` or `MemgraphStorage` | Native graph DB; Cypher queries; label-based workspace isolation |
| Doc Status | `PGDocStatusStorage` or `MongoDocStatusStorage` | PostgreSQL for simplicity; MongoDB if already in your stack |

This adds operational complexity (multiple systems to back up, monitor, and upgrade) but avoids the PostgreSQL multi-workspace vector search limitation and provides native graph query capabilities.

### What to Avoid in Production

- **Default file-based backends** (`JsonKVStorage`, `NanoVectorDBStorage`, `NetworkXStorage`, `JsonDocStatusStorage`) — explicitly documented as development/evaluation only.
- **Apache AGE on managed/serverless PostgreSQL** (e.g., Neon) — likely unavailable due to superuser extension requirements; use `PGTableGraphStorage` instead.
- **Rolling upgrades with shared storage** — stop all old workers before starting new versions against the same PostgreSQL/workspace.

---

## Sources

1. LightRAG GitHub Repository: https://github.com/HKUDS/LightRAG
2. LightRAG Official Documentation Site: https://lightrag.github.io
3. Programming With LightRAG Core (storage backend matrix): https://github.com/HKUDS/LightRAG/blob/main/docs/ProgramingWithCore.md
4. LightRAG Server and WebUI (production deployment, workspace isolation, storage recommendations): https://github.com/HKUDS/LightRAG/blob/main/docs/LightRAG-API-Server.md
5. PostgreSQL Filtered Vector Search Design (pgvector iterative scan, workspace defect): https://github.com/HKUDS/LightRAG/blob/main/docs/design/PgVectorFilteredSearch.md
6. Milvus Configuration Guide: https://github.com/HKUDS/LightRAG/blob/main/docs/MilvusConfigurationGuide.md
7. env.example (configuration reference): https://github.com/HKUDS/LightRAG/blob/main/env.example
8. Railway PostgreSQL deployment template (AGE + pgvector requirements): https://railway.com/deploy/lightrag-knowledge-graph-rag-postgres-production--lightrag-postgres-graph-rag
9. GitHub Issue #2255 (PostgreSQL + AGE production logs): https://github.com/HKUDS/LightRAG/issues/2255
10. Apache AGE: https://age.apache.org
11. Neon PostgreSQL Compatibility: https://neon.com/docs/reference/compatibility

---

## Verification Notes & Unverified Items

- All storage backend class names and defaults were taken directly from the `LightRAG Init Parameters` table in `docs/ProgramingWithCore.md` (official repository).
- Single-backend recommendations (PostgreSQL, MongoDB, OpenSearch) and specialized options (Milvus, Qdrant, Neo4j, Memgraph) are confirmed in both `docs/ProgramingWithCore.md` and `docs/LightRAG-API-Server.md`.
- The Apache AGE requirement for `PGGraphStorage` is confirmed by the Railway deployment template and GitHub issue #2255.
- **Unverified:** The specific pgvector version Neon runs. The multi-workspace vector search defect mitigation (`SET LOCAL hnsw.iterative_scan = strict_order`) requires pgvector >= 0.8; this could not be verified for Neon.
- **Unverified:** Apache AGE availability on Neon. Based on general knowledge that AGE requires superuser privileges and a Neon community feature request exists, it is likely unavailable, but this was not confirmed by Neon's official documentation.
- Community-contributed backends (LanceDB, Nebula Graph) are noted as not part of the official main release.

---

## Final Recommendation

For a production AI agent using LightRAG, deploy a **single PostgreSQL instance** with `PGKVStorage`, `PGVectorStorage`, `PGTableGraphStorage`, and `PGDocStatusStorage`. This gives you ACID guarantees, single-database operations, and no dependency on Apache AGE (which is problematic on managed/serverless PostgreSQL like Neon). If you are on Neon, verify pgvector >= 0.8 for multi-workspace vector correctness; if that verification fails or you have many uneven workspaces, switch vector storage to Qdrant while keeping the other three roles on PostgreSQL. Avoid the default file-based backends in production.

## V2 final response

# LightRAG Storage Options — Technical Report

**Bottom line:** LightRAG’s official home is the HKUDS/LightRAG GitHub repository, with documentation in its `docs/` directory. It defines four storage roles (key-value, vector, graph, document status). The default file-backed stores are for development only. For production, the docs recommend PostgreSQL as a single backend for all four roles; MongoDB and OpenSearch are the other all-in-one options, while Milvus/Qdrant (vector) and Neo4j/Memgraph (graph) are specialized alternatives. PostgreSQL is a suitable production setup, but Neon-specific support is not documented and should be treated as unverified.

---

## 1. Official documentation and repository

- **Official repository:** https://github.com/hkuds/lightrag — “LightRAG: Simple and Fast Retrieval-Augmented Generation” (EMNLP 2025), from HKUDS. This is the repository the search results consistently treat as official; it publishes Docker images at `ghcr.io/hkuds/lightrag` and the PyPI package `lightrag-hku`.
- **Documentation:** lives in the repository’s `docs/` folder. Confirmed documents include:
  - `docs/ProgramingWithCore.md` — storage types and isolation methods
  - `docs/LightRAG-API-Server.md` — storage environment variables, production backends, migration limits
  - `docs/DockerDeployment.md` — Docker / Compose deployment and image verification
  - `docs/InteractiveSetup.md` — setup wizard (`.env`, `docker-compose.final.yml`)
  - `docs/AppleContainerSetup.md` — Postgres / Neo4j / Milvus stack on Apple container runtime

**Uncertainty:** A search result also surfaced `https://github.com/LarFii/LightRAG-hku`, described as a fork “based on nano-graphrag.” I could not determine from the evidence whether this is an official mirror or a community fork, so I treat `hkuds/lightrag` as the authoritative source.

**Limitation:** The full documentation pages were not completely fetched (the retrieval steps for detailed docs did not finish), so several details below come from search-result snippets of those pages rather than full-page reads.

---

## 2. Supported storage backends

LightRAG uses four storage types, each pluggable via environment variables (`LIGHTRAG_KV_STORAGE`, `LIGHTRAG_VECTOR_STORAGE`, `LIGHTRAG_GRAPH_STORAGE`, `LIGHTRAG_DOC_STATUS_STORAGE`).

| Storage type | What it stores | Default (dev only) | Production-capable backends | Specialized / alternative |
|---|---|---|---|---|
| Key-value (KV) | LLM response cache, text chunks, document info | `JsonKVStorage` (local files) | `PGKVStorage`, `MongoKVStorage`, `RedisKVStorage` | — |
| Vector | Chunk, entity, and relation embeddings | `NanoVectorDBStorage` (local files) | `PGVectorStorage`, `MongoVectorDBStorage`, OpenSearch | Milvus, Qdrant |
| Graph | Entity–relation knowledge graph | `NetworkXStorage` (local files) | `PGTableGraphStorage`, `PGGraphStorage` (Apache AGE), `MongoGraphStorage`, OpenSearch | Neo4j, Memgraph |
| Document status | Document indexing status / list | `JsonDocStatusStorage` (local files) | `PGDocStatusStorage` (covered by Postgres all-in-one); MongoDB and OpenSearch also claim all-four coverage | — |

**All-in-one production backends** (one database for all four roles): PostgreSQL (recommended), MongoDB, OpenSearch.

**Workspace isolation** differs by backend:
- File/JSON stores: workspace subdirectories
- Redis, Milvus, MongoDB, PostgreSQL graph: workspace prefix on collection name
- Qdrant: payload-based partitioning

**Verified class names** come from the docs snippets: `PGKVStorage`, `PGVectorStorage`, `PGTableGraphStorage`, `PGDocStatusStorage` (API Server example), plus `JsonKVStorage`, `JsonDocStatusStorage`, `NetworkXStorage`, `NanoVectorDBStorage`, `RedisKVStorage`, `MilvusVectorDBStorage`, `MongoKVStorage`, `MongoVectorDBStorage`, `MongoGraphStorage`, `PGGraphStorage`, and `QdrantVectorDBStorage`.

OpenSearch requires OpenSearch 3.x or higher with the k-NN plugin enabled.

---

## 3. Differences between the available options

| Dimension | File-backed defaults | PostgreSQL (unified) | MongoDB / OpenSearch (unified) | Specialized split (Milvus/Qdrant + Neo4j/Memgraph) |
|---|---|---|---|---|
| Production fit | Explicitly not for production | Recommended | Supported | Supported but more complex |
| Operational footprint | Zero external infra | One database | One database | Multiple databases to run and back up |
| Cross-storage consistency | N/A (single process/files) | ACID within one DB | Document-store semantics | No cross-database transactions; consistency is application-level |
| Query style | File lookups | SQL + pgvector + (Apache AGE for graph) | Document / full-text + k-NN | Cypher (Neo4j), native vector APIs |
| Migration between backends | Not supported (choose before first upload) | One documented exception: graph can move from `PGGraphStorage` (Apache AGE) to `PGTableGraphStorage` without re-indexing | Not supported | Not supported |

Key takeaway: unified backends (PostgreSQL, MongoDB, OpenSearch) keep all four LightRAG storage roles in one system, which simplifies operations, backups, and consistency. Splitting vector and graph onto specialized databases adds infrastructure and removes cross-store transactional guarantees.

---

## 4. Is PostgreSQL / Neon suitable?

**PostgreSQL: yes — it is the officially recommended production backend.** The docs state PostgreSQL can serve all four storage types on its own, and the example configuration is:

```
LIGHTRAG_KV_STORAGE=PGKVStorage
LIGHTRAG_VECTOR_STORAGE=PGVectorStorage
LIGHTRAG_GRAPH_STORAGE=PGTableGraphStorage
LIGHTRAG_DOC_STATUS_STORAGE=PGDocStatusStorage
```

A Railway deployment guide for LightRAG confirms a production template running `ghcr.io/hkuds/lightrag` against PostgreSQL with the **pgvector** and **Apache AGE** extensions, with all four storage roles pointed at Postgres. Note the graph path has two variants: `PGGraphStorage` (Apache AGE) and `PGTableGraphStorage` (plain PostgreSQL tables), with a documented one-way migration from AGE to tables.

**Neon: not verified.** Neon is not mentioned in any of the retrieved LightRAG sources. Neon is PostgreSQL-compatible and offers pgvector, but:
- Apache AGE is a server extension that must be installed on the Postgres instance; managed/serverless Postgres offerings may not provide it.
- `PGTableGraphStorage` uses plain PostgreSQL tables and *may* work on Neon, but I found no evidence confirming this.
- I cannot confirm connection-pooling behavior, socket requirements, or Neon-specific limits for LightRAG.

**Verdict:** PostgreSQL is suitable and recommended. Neon is plausible because it is PostgreSQL-compatible, but LightRAG-on-Neon is unverified — test it (especially graph storage via `PGTableGraphStorage`) before committing to production.

---

## 5. Compatibility limitations and configuration considerations

1. **Choose storage before the first upload.** Direct migration between storage implementations is not supported, except the one-way graph move from `PGGraphStorage` (Apache AGE) to `PGTableGraphStorage`. Changing storage after indexing requires re-uploading/re-indexing documents.
2. **Environment variables must be set before the initial launch** of the API server; the storage implementation is selected via `LIGHTRAG_*_STORAGE` variables.
3. **Parser changes affect only new uploads.** Changing `LIGHTRAG_PARSER` does not reprocess already-indexed documents; delete and re-upload to apply a different parser route.
4. **Workspace isolation varies** by backend (subdirectories vs. collection-name prefix vs. Qdrant payload partitioning) — relevant for multi-tenant or multi-workspace deployments.
5. **OpenSearch prerequisites:** OpenSearch 3.x+ with the k-NN plugin enabled.
6. **Community-only options:** LanceDB (all four types, `dev-lancedb` branch) and Nebula Graph (`dev-nebula-graph` branch) are community-contributed and not on the main release path.
7. **Default stores are explicitly for development/debugging**, not production (NetworkX graph, NanoVectorDB vectors, JSON KV/doc status).

---

## 6. Recommended production storage architecture for an AI agent

**Recommended:** Unified PostgreSQL for all four roles.

- **Backend:** PostgreSQL with `pgvector` (for vector storage). Use `PGTableGraphStorage` for graph if you want plain tables and maximum managed-database compatibility; use `PGGraphStorage` with Apache AGE only if you self-host Postgres and need AGE’s graph query features.
- **Environment variables (set at first launch):**
  ```
  LIGHTRAG_KV_STORAGE=PGKVStorage
  LIGHTRAG_VECTOR_STORAGE=PGVectorStorage
  LIGHTRAG_GRAPH_STORAGE=PGTableGraphStorage
  LIGHTRAG_DOC_STATUS_STORAGE=PGDocStatusStorage
  ```
- **Operations:** single connection string, single backup strategy, ACID across KV/vector/graph/doc-status. Add connection pooling and standard Postgres HA/replication as needed.
- **When to diverge:** If the agent’s knowledge graph is large and you need advanced graph traversal/Cypher, evaluate keeping KV/vector/doc-status in PostgreSQL and routing graph to Neo4j or Memgraph — but accept the operational cost of a second database and the lack of cross-store transactions.
- **Avoid in production:** the default file-backed stores (JSON/NanoVectorDB/NetworkX).
- **Before committing to Neon or any serverless Postgres:** verify `PGTableGraphStorage` behavior, extension availability (pgvector at minimum; Apache AGE likely unavailable), and run a small ingestion/query test.

---

## Sources

- Official repository: https://github.com/hkuds/lightrag
- Storage env vars and production backends: https://github.com/HKUDS/LightRAG/blob/main/docs/LightRAG-API-Server.md
- Storage types and isolation: https://github.com/HKUDS/LightRAG/blob/main/docs/ProgramingWithCore.md
- Docker deployment / official images: https://github.com/hkuds/lightrag (references `ghcr.io/hkuds/lightrag`)
- Railway Postgres production template (pgvector + Apache AGE, all four storage roles): https://railway.com/deploy/lightrag-knowledge-graph-rag-postgres-production--lightrag-postgres-graph-rag
- Railway LightRAG deploy overview (supported backends list): https://railway.com/deploy/lightrag-open-source-knowledge-graph-rag-on-railway--light-rag
- Neo4j graph store support (secondary): https://neo4j.com/blog/developer/under-the-covers-with-lightrag-extraction

---

## What could not be verified

- **Neon-specific support:** not mentioned in any retrieved LightRAG source; compatibility is inferred only from Neon being PostgreSQL-compatible.
- **Exact PostgreSQL extension versions** required by LightRAG (pgvector version, Apache AGE version).
- **Performance benchmarks, scale limits, backup/HA procedures** for any backend.
- **Class names for MongoDB/OpenSearch document-status implementations** — all-four coverage is claimed, but specific class names were not confirmed beyond PostgreSQL’s.
- **Full documentation pages** were not completely retrieved; some details rely on search-result snippets rather than full-page verification.

If you need, I can follow up on any of the unverified items (especially Neon testing guidance or the exact migration procedure from Apache AGE to `PGTableGraphStorage`).

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
