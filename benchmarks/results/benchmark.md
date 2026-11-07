# NallyHermes V1 vs V2 Orchestra Benchmark

## Run metadata

| Field | V1 | V2 |
|---|---|---|
| Commit | 4ba2b87084a4b003331e0f9c687bbf0822558edd | 75e28b5736085c86d301378db31d4e924100f847 |
| Model | nvidia/nemotron-3.5-super-vl-120b-a12b | nvidia/nemotron-3.5-super-vl-120b-a12b |
| Status | completed | completed |

## Execution metrics

| Metric | V1 | V2 | V2 vs V1 |
|---|---:|---:|---:|
| Duration (ms) | 167821 | 132956 | -20.8% |
| Model calls | not instrumented | 17 | n/a |
| Median input tokens / call | n/a | 6842 | n/a |
| Median output tokens / call | n/a | 394 | n/a |
| Median total tokens / call | n/a | 7253 | n/a |
| Model-call errors | not instrumented | 0 | n/a |
| Model turns with tool calls | not instrumented | 15 | n/a |
| Tool calls requested by model | not instrumented | 29 | n/a |
| Progress events | 113 | 79 | -30.1% |
| Tool calls started | 28 | 12 | -57.1% |
| Tool errors | 3 | 0 | -100.0% |
| Cached read-only tool results | 0 | 16 | n/a |
| Retry events | 2 | 0 | -100.0% |
| Plan steps started | 4 | 2 | -50.0% |
| Plan steps completed | 4 | 0 | -100.0% |
| Plan steps partially completed | 0 | 1 | n/a |
| Plan steps failed | 0 | 0 | n/a |
| Plan steps blocked | 0 | 3 | n/a |
| Task outcome | not_reported | partial | n/a |

> Lower is not always better: fewer tool calls or events can mean efficiency, but can also mean incomplete work. Interpret metrics alongside the reports and event traces.

## V1 final response

# LightRAG Storage Options — Technical Report

## 1. Official Documentation and Repository

| Item | Detail |
|------|--------|
| **Official GitHub repository** | HKUDS/LightRAG — https://github.com/HKUDS/LightRAG |
| **Official project page** | https://lightrag.github.io |
| **PyPI package** | `lightrag-hku` |
| **License** | MIT |
| **Maintainer** | HKUDS (Data Intelligence Lab, University of Hong Kong) |

Key documentation files in the repository:
- `README.md` — project overview, storage selection guidance, production recommendations
- `docs/ProgramingWithCore.md` — SDK/init parameters including all storage type options
- `docs/LightRAG-API-Server.md` — server deployment, storage types supported, environment variables
- `docs/DockerDeployment.md` — Docker/Compose deployment including PostgreSQL image details
- `docs/InteractiveSetup.md` — `make env-*` setup wizard for storage configuration
- `env.example` — full configuration reference

---

## 2. Supported Storage Backends

LightRAG requires **four distinct storage roles**, each with its own pluggable backend:

| Storage Role | Purpose | Default (dev only) | Production Options |
|---|---|---|---|
| **KV_STORAGE** | LLM response cache, text chunks, entity-relation extraction results | `JsonKVStorage` | `PGKVStorage`, `RedisKVStorage`, `MongoKVStorage`, `OpenSearchKVStorage` |
| **VECTOR_STORAGE** | Embedding vectors for chunks, entities, relationships | `NanoVectorDBStorage` | `PGVectorStorage`, `MilvusVectorDBStorage`, `QdrantVectorDBStorage`, `FaissVectorDBStorage`, `ChromaVectorDBStorage`, `MongoVectorDBStorage`, `OpenSearchVectorDBStorage` |
| **GRAPH_STORAGE** | Entity-relation knowledge graph structure | `NetworkXStorage` | `Neo4JStorage`, `PGGraphStorage`, `PGTableGraphStorage`, `AGEStorage`, `MemgraphStorage`, `OpenSearchGraphStorage`, `MongoGraphStorage` |
| **DOC_STATUS_STORAGE** | Document indexing/processing status | `JsonDocStatusStorage` | `PGDocStatusStorage`, `MongoDocStatusStorage`, `OpenSearchDocStatusStorage`, `RedisDocStatusStorage` |

**Source:** `docs/ProgramingWithCore.md` (init parameter table) and `docs/LightRAG-API-Server.md` (Storage Types Supported section).

### Single-backend options (one database serves all four roles)
- **PostgreSQL** — explicitly recommended for production; all four via `PGKVStorage`, `PGVectorStorage`, `PGGraphStorage`/`PGTableGraphStorage`, `PGDocStatusStorage`
- **MongoDB** — all four roles; vector storage requires MongoDB Atlas Cloud
- **OpenSearch** — all four roles; requires OpenSearch 3.3.0+ for the v1.5 storage path

### Specialized per-role options
- Vector: Milvus, Qdrant, Chroma, Faiss
- Graph: Neo4j, Memgraph

---

## 3. Differences Between Storage Options

### Default / Development Storage
`JsonKVStorage` + `NanoVectorDBStorage` + `NetworkXStorage` + `JsonDocStatusStorage` are in-memory databases with local JSON file persistence under `WORKING_DIR`. Capacity is bounded by available RAM. The documentation is explicit: **these are for small-scale testing, evaluation, and debugging only — not for production.**

### PostgreSQL (Recommended for Production)
Can serve all four storage types on a single database:
- `PGKVStorage`, `PGDocStatusStorage` — run on stock PostgreSQL, no extensions required
- `PGVectorStorage` — requires the **pgvector** extension
- `PGGraphStorage` — requires the **Apache AGE** extension
- `PGTableGraphStorage` — runs on **any stock PostgreSQL 14+**, creates its own tables at `initialize()`, **no extension required**

Key behaviors:
- Vector dimension (`EMBEDDING_DIM`) is fixed when vector tables are first created; changing the embedding model, dimension, or asymmetric-embedding settings requires clearing vector data and re-indexing all documents. LightRAG provides no re-embedding tool.
- Workspace isolation via a `workspace` column in tables (for `PGKVStorage`, `PGVectorStorage`, `PGDocStatusStorage`); `PGGraphStorage` uses collection-name prefixes.
- A graph migration path exists from `PGGraphStorage` → `PGTableGraphStorage` without re-indexing.

### Neo4j / Memgraph (Graph-Specialized)
Native graph databases purpose-built for entity-relation traversal and multi-hop queries. Graph only; must be paired with separate KV, vector, and doc-status backends.

### Milvus / Qdrant / Chroma / Faiss (Vector-Specialized)
Purpose-built vector databases with advanced ANN indexing. Vector only; must be paired with separate backends for KV, graph, and doc-status.

### MongoDB / OpenSearch (Unified Alternatives)
MongoDB: flexible document storage, all four roles, but vector storage requires MongoDB Atlas Cloud. OpenSearch: all four roles, requires OpenSearch 3.3.0+.

### Key Architectural Difference
LightRAG separates concerns: KV (cache/chunks), vector (semantic search), graph (relationships), and doc-status (ingestion tracking) each have different access patterns. Using specialized backends per role optimizes each pattern but increases operational complexity. A unified PostgreSQL backend simplifies operations at the cost of using AGE (an extension) for graph rather than a native graph engine — unless `PGTableGraphStorage` is used, which needs no extension.

---

## 4. Is PostgreSQL/Neon a Suitable Storage Setup?

### PostgreSQL — Yes, Recommended
LightRAG's own documentation states PostgreSQL is the recommended production backend — it can serve all four storage types on its own.

### Neon (Serverless PostgreSQL) — Suitable with Conditions

**Confirmed to work on Neon:**
- **pgvector:** Neon officially supports the `pgvector` extension on every plan (no add-on required). `PGKVStorage`, `PGVectorStorage`, and `PGDocStatusStorage` work on Neon.
- **`PGTableGraphStorage`:** Runs on any stock PostgreSQL 14+ with no extensions. Works on Neon as the graph backend without AGE.

**Does NOT work on Neon:**
- **Apache AGE:** Neon is a managed/serverless PostgreSQL and does **not** offer Apache AGE. LightRAG's documentation lists Neon among managed PostgreSQL services where AGE is unavailable. `PGGraphStorage` **cannot** be used on Neon.

**Verdict:** Neon is fully suitable for LightRAG production use **if you use `PGTableGraphStorage` for graph** (or pair Neon with a separate Neo4j/Memgraph for graph). It is **not** suitable as a single-backend replacement using `PGGraphStorage`, because AGE is unavailable.

Neon-specific operational considerations (inferred from Neon's serverless architecture, not LightRAG docs): serverless Postgres scales to zero and can terminate idle connections after ~5 minutes of inactivity, which can cause cold-start latency on first query. Connection pooling and stable connection strings matter for a long-running LightRAG service.

---

## 5. Compatibility Limitations and Configuration Considerations

### Critical Limitations

1. **No direct storage migration.** Direct migration between storage implementations is **not supported**, with one exception: an already-extracted graph can be moved from `PGGraphStorage` to `PGTableGraphStorage` without re-indexing. Switching storage backends generally requires re-ingesting all documents.

2. **Embedding model immutability.** The embedding model and dimension must be fixed before the first document upload. Changing the model, dimension, or asymmetric embedding settings requires clearing vector data and re-indexing. PostgreSQL requires the vector dimension defined at table creation time.

3. **Default storage is dev-only.** `JsonKVStorage`, `NanoVectorDBStorage`, `NetworkXStorage`, `JsonDocStatusStorage` are in-memory with file persistence — not for production.

4. **Apache AGE dependency for PostgreSQL graph.** `PGGraphStorage` requires the AGE extension, which is not available on managed PostgreSQL services (Neon, RDS, Cloud SQL, Supabase). `PGTableGraphStorage` is the non-AGE alternative.

5. **OpenSearch version requirement.** OpenSearch storage requires OpenSearch 3.3.0 or later; older clusters must be upgraded before enabling the v1.5 storage path.

6. **MongoDB vector limitation.** MongoDB vector storage is only available on MongoDB Atlas Cloud, not self-managed MongoDB.

7. **Concurrency / writer protocol.** When upgrading storage-backed instances, all old writers must be stopped before starting new ones against the same storage and workspace. A rolling restart with an old worker still running is a documented failure case.

8. **Authentication.** Without `LIGHTRAG_API_KEY` or `AUTH_ACCOUNTS`, the server runs with no authentication — unsafe for network exposure.

### Configuration Considerations

| Variable | Purpose | Production Guidance |
|---|---|---|
| `LIGHTRAG_KV_STORAGE` | KV backend | `PGKVStorage` for production |
| `LIGHTRAG_VECTOR_STORAGE` | Vector backend | `PGVectorStorage` (PostgreSQL) or `MilvusVectorDBStorage`/`QdrantVectorDBStorage` |
| `LIGHTRAG_GRAPH_STORAGE` | Graph backend | `PGTableGraphStorage` (no extension) or `PGGraphStorage` (requires AGE); `Neo4JStorage`/`MemgraphStorage` for graph-specialized |
| `LIGHTRAG_DOC_STATUS_STORAGE` | Doc status backend | `PGDocStatusStorage` for production |
| `POSTGRES_HOST/PORT/USER/PASSWORD/DATABASE` | PostgreSQL connection | Required for all PG backends |
| `POSTGRES_MAX_CONNECTIONS` | Connection pool size | Tune based on concurrent workers |
| `POSTGRES_VECTOR_INDEX_TYPE` | Vector index algorithm | `HNSW` (better recall, more memory) or `IVFFLAT` (faster builds, lower recall) |
| `POSTGRES_HNSW_M / HNSW_EF / IVFFLAT_LISTS` | Index tuning | Tune for dataset size and recall targets |
| `EMBEDDING_DIM` | Vector dimension | Must match embedding model; defined at PG table creation |
| `WORKSPACE` / `POSTGRES_WORKSPACE` | Data isolation | Required when multiple instances share a database |
| `LIGHTRAG_API_KEY` / `AUTH_ACCOUNTS` | Authentication | Required before network exposure |
| `HOST` | Bind address | `0.0.0.0` only with authentication; use `127.0.0.1` for local-only |
| `SSL` / `SSL_CERTFILE` / `SSL_KEYFILE` | TLS | Enable before network exposure |

---

## 6. Recommended Production Storage Architecture

### Option A: Unified PostgreSQL Stack (Simplest Operations) — Recommended

**Best for:** Most production AI agent deployments wanting operational simplicity.

```
┌─────────────────────────────────────────────────────────┐
│  PostgreSQL (pgvector extension)                        │
│  ├─ PGKVStorage        → LLM cache, chunks, extractions │
│  ├─ PGVectorStorage    → embeddings (HNSW index)        │
│  ├─ PGTableGraphStorage→ knowledge graph (no AGE needed)│
│  └─ PGDocStatusStorage → ingestion status               │
└─────────────────────────────────────────────────────────┘
```

**Configuration:**
```env
LIGHTRAG_KV_STORAGE=PGKVStorage
LIGHTRAG_VECTOR_STORAGE=PGVectorStorage
LIGHTRAG_GRAPH_STORAGE=PGTableGraphStorage
LIGHTRAG_DOC_STATUS_STORAGE=PGDocStatusStorage
POSTGRES_HOST=<your-postgres-host>
POSTGRES_PORT=5432
POSTGRES_DATABASE=lightrag
POSTGRES_MAX_CONNECTIONS=20
POSTGRES_VECTOR_INDEX_TYPE=HNSW
POSTGRES_HNSW_M=16
POSTGRES_HNSW_EF=200
EMBEDDING_DIM=1024  # match your embedding model
WORKSPACE=production
LIGHTRAG_API_KEY=<secure-key>
```

**If using Neon:** Use Neon for all four roles via `PGKVStorage`, `PGVectorStorage` (pgvector), `PGTableGraphStorage` (no AGE), `PGDocStatusStorage`. Configure connection pooling for Neon's serverless architecture.

### Option B: Hybrid Specialized Stack (Maximum Performance)

**Best for:** High-throughput agents with heavy graph traversal or large vector corpora.

```
┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│  PostgreSQL │  │   Neo4j     │  │  Milvus/    │  │  Redis      │
│  (KV +      │  │  (Graph     │  │  Qdrant     │  │  (KV cache) │
│  doc-status)│  │   only)     │  │  (Vector    │  │             │
└─────────────┘  └─────────────┘  │  only)      │  └─────────────┘
                                 └─────────────┘
```

### Option C: Neon + Separate Graph (Cloud-Native)

**Best for:** Cloud-native deployments preferring managed serverless PostgreSQL.

```
┌─────────────────────┐  ┌─────────────┐
│  Neon (pgvector)    │  │  Neo4j      │
│  ├─ PGKVStorage     │  │  (Graph     │
│  ├─ PGVectorStorage │  │   only)     │
│  └─ PGDocStatusStorage│ └─────────────┘
└─────────────────────┘
```

---

## 7. Final Recommendation

**For a production AI agent, use PostgreSQL as the unified storage backend** — it is LightRAG's explicitly recommended production backend, supports all four storage roles in one database, simplifies backups and operations, and avoids the complexity of managing multiple heterogeneous storage systems.

**If deploying on Neon:** Neon is suitable for KV, vector, and doc-status storage via pgvector, and for graph storage via `PGTableGraphStorage` (no AGE required). Do **not** attempt to use `PGGraphStorage` on Neon, as Apache AGE is unavailable. Configure connection pooling for Neon's serverless scale-to-zero behavior.

**Essential production checklist:**
- Enable authentication (`LIGHTRAG_API_KEY` or `AUTH_ACCOUNTS`) before network exposure
- Fix the embedding model and dimension before first ingestion (changes require re-indexing)
- Configure connection pooling (`POSTGRES_MAX_CONNECTIONS`) and vector index type (`HNSW` recommended for recall)
- Use workspaces (`WORKSPACE` / `POSTGRES_WORKSPACE`) if running multiple LightRAG instances against the same database
- Stop all old writers before upgrading storage-backed instances
- Do not use the default JSON/NetworkX/NanoVectorDB backends in production

---

## Sources

1. **LightRAG official repository:** https://github.com/HKUDS/LightRAG
2. **README.md** (raw): https://raw.githubusercontent.com/HKUDS/LightRAG/main/README.md
3. **ProgramingWithCore.md** (raw): https://raw.githubusercontent.com/HKUDS/LightRAG/main/docs/ProgramingWithCore.md
4. **LightRAG-API-Server.md** (raw): https://raw.githubusercontent.com/HKUDS/LightRAG/main/docs/LightRAG-API-Server.md
5. **DockerDeployment.md** (raw): https://raw.githubusercontent.com/HKUDS/LightRAG/main/docs/DockerDeployment.md
6. **InteractiveSetup.md** (raw): https://raw.githubusercontent.com/HKUDS/LightRAG/main/docs/InteractiveSetup.md
7. **env.example** (raw): https://raw.githubusercontent.com/HKUDS/LightRAG/main/env.example
8. **Neon pgvector documentation:** https://neon.com/docs/extensions/pgvector

---

## Verification Notes and Remaining Uncertainty

**Confirmed findings:** All LightRAG storage backend lists, the PostgreSQL production recommendation, the Apache AGE requirement for `PGGraphStorage`, the `PGTableGraphStorage` non-AGE alternative, and the Neon/AGE incompatibility statement come directly from the official HKUDS/LightRAG repository documentation. Neon pgvector support was confirmed via Neon's own documentation.

**Unverified / inferred:**
- The specific combination of `PGTableGraphStorage` on Neon was not explicitly documented in the LightRAG repo; it is inferred from LightRAG's statement that `PGTableGraphStorage` runs on any stock PostgreSQL 14+ with no extensions, and Neon provides standard PostgreSQL. This should be verified by testing before production commitment.
- Neon's scale-to-zero behavior (~5 minutes idle) is inferred from Neon's serverless architecture, not from LightRAG documentation.
- No Neon-published statement confirming Apache AGE absence was found; that claim rests on LightRAG's documentation listing Neon among managed services without AGE.

All four research steps were completed successfully. No steps remain incomplete.

## V2 final response

# LightRAG Storage Options — Technical Report

**Status:** Partial research. Steps 2–4 of the original plan were blocked by a tool limit, but Step 1 gathered substantive evidence from the official repository, its docs folder, and the publication site. This report synthesizes that evidence, labels what is confirmed versus inferred, and discloses what remains unverified.

---

## 1. Official documentation and repository

| Item | Finding | Source |
|------|---------|--------|
| Repository | **HKUDS/LightRAG** — "[EMNLP2025] LightRAG: Simple and Fast Retrieval-Augmented Generation" | https://github.com/hkuds/lightrag |
| Paper | arxiv.org/abs/2410.05779 | Linked from repository About section |
| Documentation | Reference docs live in the repo's `docs/` folder (InteractiveSetup.md, DockerDeployment.md, AppleContainerSetup.md, LightRAG-API-Server.md, ProgramingWithCore.md). Chinese translations ship as `-zh.md` files. | https://github.com/hkuds/lightrag (docs/ listing) |
| Publication site | https://lightrag.github.io — project landing page (last modified 18 Oct 2024 per HTTP header) | https://lightrag.github.io/ |
| Install package | `pip install lightrag-hku` | Referenced in repository materials |
| License | MIT | Repository |
| Activity | Last push reported around 23–24 March 2026; star counts conflict across sources (30,316 vs ~40.5k), so treat popularity figures as approximate. | GitHub Stars Leaderboard; repository page |

**Confirmed:** The canonical source is the GitHub repository `hkuds/lightrag`; its `docs/` folder is the official documentation. There is no separate, dedicated documentation portal beyond the repo docs and the publication landing page.

**Unverified:** I could not fetch the full rendered `docs/` pages (GitHub returned the React shell), so specific configuration examples and the exact "Storage Types Supported" matrix were not directly inspected.

---

## 2. Supported storage backends

LightRAG defines four storage roles, each configurable via an environment variable:

- **KV_STORAGE** — LLM response caches, text chunking results, entity–relation extraction results
- **VECTOR_STORAGE** — vector embeddings for text chunks, entities, and relationships
- **GRAPH_STORAGE** — the knowledge graph (entities + relationships)
- **DOC_STATUS_STORAGE** — document list / ingestion pipeline state

### Default (non-production)
The default KV, vector, and graph stores are **in-memory databases with local file persistence**. The documentation states these are suitable only for small-scale testing and evaluation, **not** for production.

### Production backends (from repository documentation)
- **PostgreSQL** — recommended for production; can serve **all four** storage types on its own
- **MongoDB** — single-backend option
- **OpenSearch** — single-backend option
- **Milvus / Qdrant** — specialized vector storage (would need to be paired with other backends for KV/graph/doc-status)
- **Neo4j / Memgraph** — specialized graph storage (Cypher-based; would need to be paired with other backends)

### Third-party / extension implementation
AgensGraph (a PostgreSQL-based graph database) ships LightRAG storage classes: `AgensgraphStorage` (graph), `AgensgraphVectorStorage` (three pgvector tables with HNSW indexes), `AgensgraphKVStorage` (one JSONB table), and `AgensgraphDocStatusStorage` (one typed table). This lets one AgensGraph database back the whole pipeline. This appears to be a third-party module rather than core LightRAG.

**Confirmed:** Four storage roles exist; defaults are in-memory/file and not production-grade; PostgreSQL is named as the recommended production backend capable of all four roles; MongoDB, OpenSearch, Milvus, Qdrant, Neo4j, and Memgraph are mentioned as alternatives.

**Unverified:** Exact environment-variable values, per-backend feature matrices, and whether MongoDB/OpenSearch truly cover all four roles or only some — I could not read the full "Storage Types Supported" doc.

---

## 3. Differences between the available options

| Option | Architecture | Best for | Trade-offs |
|--------|-------------|----------|------------|
| In-memory + local files (default) | Embedded, zero external infra | Prototyping, eval, single-user demos | Not production-safe; no concurrency, scaling, or durability guarantees |
| PostgreSQL (all four roles) | Single relational backend; pgvector for vectors | Simplest production path; operational simplicity | One database to manage, tune, back up, and scale |
| MongoDB | Document store | If already standardized on MongoDB | Less mature LightRAG integration evidence than PostgreSQL |
| OpenSearch | Search/vector engine | If full-text + vector search already in stack | Additional operational component |
| Milvus / Qdrant (vector only) | Specialized vector DB | Very large vector collections | Requires separate KV/graph/doc-status backends; more moving parts |
| Neo4j / Memgraph (graph only) | Property graph, Cypher | Complex graph traversals beyond LightRAG's defaults | Requires separate backends for the other three roles |
| AgensGraph (PostgreSQL + graph) | Single PostgreSQL-compatible DB for all four roles | Teams wanting graph + relational in one Postgres instance | Third-party module; verify maintenance and version alignment |

**Key distinction:** PostgreSQL is the only backend explicitly described as able to cover all four storage roles by itself. Specialized vector or graph stores solve one role well but increase infrastructure complexity because the other roles still need backends.

---

## 4. Is PostgreSQL / Neon suitable?

**PostgreSQL:** Yes — it is the officially recommended production backend and can serve all four storage types (KV, vector via pgvector, graph, doc-status) on its own. That makes it the simplest supported setup for a production AI agent.

**Neon specifically:** Neon is a serverless, PostgreSQL-compatible database. Because LightRAG's recommendation is PostgreSQL at the protocol level, Neon *should* work in principle. However, I **could not verify Neon compatibility from official LightRAG sources**. Considerations that would need checking before adopting Neon:
- pgvector extension availability and version on Neon
- Connection pooling / serverless cold-start behavior with LightRAG's async connection pools
- Whether LightRAG expects persistent connections that serverless Postgres may interrupt

**Verdict:** PostgreSQL is confirmed suitable. Neon is a reasonable inference based on PostgreSQL compatibility, but it is **not an officially verified LightRAG deployment** — treat it as "likely compatible, validate before production."

---

## 5. Compatibility limitations and configuration considerations

- **Default stores are not for production.** You must explicitly set storage backend environment variables (`KV_STORAGE`, `VECTOR_STORAGE`, `GRAPH_STORAGE`, `DOC_STATUS_STORAGE`) to use external databases.
- **Mixed backends are allowed but add complexity.** You can pair, e.g., Neo4j for graph with PostgreSQL for KV/vector/doc-status, but you then operate two systems.
- **Embedding dimension consistency.** The vector store must match the embedding model's output dimensions (e.g., 1600-dim vectors noted in one tutorial referencing Qdrant).
- **Docker Compose stacks reference Postgres / Neo4j / Milvus.** The repo's Docker deployment docs describe multi-service stacks, suggesting these combinations are pre-validated by the maintainers.
- **AgensGraph is a separate module.** If considering it, confirm it tracks the LightRAG version you deploy.
- **Document status drives incremental ingestion.** The doc-status store implements the scheduling API for the ingestion pipeline (noted for LightRAG 1.5.6), so it matters for production ingestion workflows.

---

## 6. Recommended production storage architecture

**Primary recommendation:** Single PostgreSQL instance (managed, e.g., RDS/Aurora or self-hosted) with the **pgvector** extension, backing all four LightRAG storage roles:
- KV → PostgreSQL table(s)
- VECTOR → pgvector tables with HNSW indexes
- GRAPH → PostgreSQL graph tables
- DOC_STATUS → PostgreSQL state table

**Why:** It is the officially recommended backend, minimizes operational surface (one database to back up, monitor, and scale), and is explicitly supported for all four roles.

**When to deviate:**
- If you already run **Neo4j** and need complex graph traversals beyond LightRAG's built-in graph reasoning, use Neo4j for `GRAPH_STORAGE` and PostgreSQL for the other three roles.
- If you have **very large vector collections** (millions of embeddings) where pgvector HNSW is insufficient, evaluate Milvus or Qdrant for `VECTOR_STORAGE` only, keeping PostgreSQL for KV/graph/doc-status.
- If you want serverless operations, **Neon** is the natural PostgreSQL-compatible candidate, but validate pgvector support and connection behavior first.

**Operational checklist:**
1. Set the four storage env vars to point at PostgreSQL.
2. Enable pgvector and create HNSW indexes on vector tables.
3. Configure connection pooling appropriate to your agent's concurrency.
4. Set up backups and point-in-time recovery for the PostgreSQL instance.
5. Pin embedding model dimensions and verify they match the vector store schema.
6. Test incremental ingestion and doc-status transitions before cutover.

---

## Sources

- https://github.com/hkuds/lightrag — official repository and `docs/` folder
- https://lightrag.github.io/ — official publication/landing page
- https://arxiv.org/abs/2410.05779 — LightRAG paper (EMNLP 2025)
- https://tech.skaiworldwide.com/docs/en/agensgraph-ai/lightrag/overview.html — AgensGraph LightRAG module (third-party, for reference on single-DB all-four-roles pattern)

---

### What remains unverified
Because steps 2–4 were blocked by a tool limit, I did not directly fetch the full `docs/` storage pages. The following come from search-result snippets attributed to the repository and should be re-checked against the live docs before finalizing an implementation:
- Exact `KV_STORAGE` / `VECTOR_STORAGE` / `GRAPH_STORAGE` / `DOC_STATUS_STORAGE` env var values per backend
- Whether MongoDB and OpenSearch cover all four roles or a subset
- Neon-specific compatibility statements (none found in the collected evidence)
- Version-specific behavior (LightRAG 1.5.x) for doc-status scheduling

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
