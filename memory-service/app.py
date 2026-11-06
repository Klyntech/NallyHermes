import asyncio
import os
import re
import uuid
from contextlib import asynccontextmanager
from functools import partial
from urllib.parse import unquote, urlsplit

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field
from lightrag import LightRAG, QueryParam
from lightrag.llm.openai import openai_complete_if_cache, openai_embed
from lightrag.utils import EmbeddingFunc

DATABASE_URL = os.environ["DATABASE_URL"]


def configure_postgres_from_url() -> None:
    parts = urlsplit(DATABASE_URL)
    if not parts.hostname or not parts.username or not parts.password or not parts.path.strip("/"):
        raise RuntimeError("DATABASE_URL must be a complete PostgreSQL connection URL.")
    os.environ["POSTGRES_HOST"] = parts.hostname
    os.environ["POSTGRES_PORT"] = str(parts.port or 5432)
    os.environ["POSTGRES_USER"] = unquote(parts.username)
    os.environ["POSTGRES_PASSWORD"] = unquote(parts.password)
    os.environ["POSTGRES_DATABASE"] = unquote(parts.path.lstrip("/").split("/")[0])
    os.environ.setdefault("POSTGRES_SSL_MODE", "require")
    os.environ.setdefault("POSTGRES_MAX_CONNECTIONS", "5")


configure_postgres_from_url()
API_TOKEN = os.environ["LIGHTRAG_API_TOKEN"]
NIM_API_KEY = os.environ["NVIDIA_NIM_API_KEY"]
NIM_BASE_URL = os.getenv("NVIDIA_NIM_BASE_URL", "https://integrate.api.nvidia.com/v1")
LLM_MODEL = os.environ["LIGHTRAG_LLM_MODEL"]
EMBEDDING_MODEL = os.getenv("LIGHTRAG_EMBEDDING_MODEL", "nvidia/nemotron-3-embed-1b")
EMBEDDING_DIM = int(os.getenv("LIGHTRAG_EMBEDDING_DIM", "2048"))

if len(API_TOKEN) < 32:
    raise RuntimeError("LIGHTRAG_API_TOKEN must contain at least 32 characters.")


async def llm_model_func(prompt, system_prompt=None, history_messages=None, **kwargs):
    return await openai_complete_if_cache(
        LLM_MODEL,
        prompt,
        system_prompt=system_prompt,
        history_messages=history_messages or [],
        api_key=NIM_API_KEY,
        base_url=NIM_BASE_URL,
        **kwargs,
    )


embedding_function = EmbeddingFunc(
    model_name=EMBEDDING_MODEL,
    send_dimensions=False,
    embedding_dim=EMBEDDING_DIM,
    max_token_size=8192,
    func=partial(
        openai_embed.func,
        model=EMBEDDING_MODEL,
        base_url=NIM_BASE_URL,
        api_key=NIM_API_KEY,
    ),
)

rag_instances = {}
rag_locks: dict[str, asyncio.Lock] = {}


def workspace_for(user_id: str) -> str:
    if not re.fullmatch(r"[0-9]{1,25}", user_id):
        raise HTTPException(status_code=400, detail="Invalid user identifier.")
    return f"telegram_{user_id}"


async def get_rag(user_id: str) -> LightRAG:
    workspace = workspace_for(user_id)
    if workspace in rag_instances:
        return rag_instances[workspace]

    lock = rag_locks.setdefault(workspace, asyncio.Lock())
    async with lock:
        if workspace not in rag_instances:
            rag = LightRAG(
                working_dir=os.getenv("LIGHTRAG_WORKING_DIR", "./lightrag_data"),
                workspace=workspace,
                llm_model_func=llm_model_func,
                embedding_func=embedding_function,
                kv_storage="PGKVStorage",
                vector_storage="PGVectorStorage",
                graph_storage="PGTableGraphStorage",
                doc_status_storage="PGDocStatusStorage",
            )
            await rag.initialize_storages()
            rag_instances[workspace] = rag
    return rag_instances[workspace]


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    for rag in rag_instances.values():
        await rag.finalize_storages()


app = FastAPI(title="NallyHermes LightRAG", version="0.1.0", lifespan=lifespan)


class InsertRequest(BaseModel):
    user_id: str = Field(min_length=1, max_length=25)
    memory_id: str = Field(min_length=1, max_length=80)
    content: str = Field(min_length=1, max_length=4000)


class QueryRequest(BaseModel):
    user_id: str = Field(min_length=1, max_length=25)
    query: str = Field(min_length=1, max_length=2000)


class DeleteRequest(BaseModel):
    user_id: str = Field(min_length=1, max_length=25)
    memory_id: str = Field(min_length=1, max_length=80)


def authorize(authorization: str | None):
    if authorization != f"Bearer {API_TOKEN}":
        raise HTTPException(status_code=401, detail="Unauthorized")


@app.get("/health")
async def health():
    return {"status": "ok"}

@app.post("/v1/diagnostics/pipeline")
async def diagnose_pipeline(payload: QueryRequest, authorization: str | None = Header(default=None)):
    authorize(authorization)
    rag = await get_rag(payload.user_id)
    memory_id = f"nally-diagnostic-{uuid.uuid4()}"
    marker = f"NALLY_PIPELINE_CHECK_{uuid.uuid4().hex}"
    content = (
        f"{marker}: A temporary legal-study diagnostic note. "
        "The fictional case concerns contract formation, offer, and acceptance."
    )
    result = {
        "initialized": True,
        "written": False,
        "read": False,
        "deleted": False,
        "absent_after_delete": False,
    }
    try:
        await rag.ainsert(content, ids=[memory_id], file_paths=[f"diagnostic:{memory_id}"])
        result["written"] = True
        retrieved = await rag.aquery(
            marker,
            param=QueryParam(mode="naive", top_k=5, only_need_context=True),
        )
        result["read"] = bool(retrieved and marker in retrieved)
    finally:
        if result["written"]:
            await rag.adelete_by_doc_id(memory_id)
            result["deleted"] = True
            after_delete = await rag.aquery(
                marker,
                param=QueryParam(mode="naive", top_k=5, only_need_context=True),
            )
            result["absent_after_delete"] = not after_delete or marker not in after_delete
    result["success"] = all(result[key] for key in (
        "initialized", "written", "read", "deleted", "absent_after_delete"
    ))
    return result


@app.post("/v1/memory/insert")
async def insert_memory(payload: InsertRequest, authorization: str | None = Header(default=None)):
    authorize(authorization)
    rag = await get_rag(payload.user_id)
    await rag.ainsert(
        payload.content,
        ids=[payload.memory_id],
        file_paths=[f"memory:{payload.memory_id}"],
    )
    return {"success": True, "memory_id": payload.memory_id}


@app.post("/v1/memory/delete")
async def delete_memory(payload: DeleteRequest, authorization: str | None = Header(default=None)):
    authorize(authorization)
    rag = await get_rag(payload.user_id)
    await rag.adelete_by_doc_id(payload.memory_id)
    return {"success": True, "memory_id": payload.memory_id}


@app.post("/v1/memory/query")
async def query_memory(payload: QueryRequest, authorization: str | None = Header(default=None)):
    authorize(authorization)
    rag = await get_rag(payload.user_id)
    answer = await rag.aquery(
        payload.query,
        param=QueryParam(mode="hybrid", only_need_context=True),
    )
    return {"answer": answer or ""}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=9621)
