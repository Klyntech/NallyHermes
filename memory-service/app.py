import os
import re
from contextlib import asynccontextmanager
from functools import lru_cache

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field
from lightrag import LightRAG, QueryParam
from lightrag.llm.openai import openai_complete_if_cache, openai_embedding
from lightrag.utils import EmbeddingFunc

DATABASE_URL = os.environ["DATABASE_URL"]
API_TOKEN = os.environ["LIGHTRAG_API_TOKEN"]
NIM_API_KEY = os.environ["NVIDIA_NIM_API_KEY"]
NIM_BASE_URL = os.getenv("NVIDIA_NIM_BASE_URL", "https://integrate.api.nvidia.com/v1")
LLM_MODEL = os.getenv("LIGHTRAG_LLM_MODEL", "nvidia/nemotron-3.5-super-vl-120b-a12b")
EMBEDDING_MODEL = os.getenv("LIGHTRAG_EMBEDDING_MODEL", "nvidia/nv-embedqa-e5-v5")
EMBEDDING_DIM = int(os.getenv("LIGHTRAG_EMBEDDING_DIM", "1024"))

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


async def embedding_func(texts):
    return await openai_embedding(
        texts,
        model=EMBEDDING_MODEL,
        api_key=NIM_API_KEY,
        base_url=NIM_BASE_URL,
        embedding_dim=EMBEDDING_DIM,
    )


rag_instances = {}


def workspace_for(user_id: str) -> str:
    if not re.fullmatch(r"[0-9]{1,25}", user_id):
        raise HTTPException(status_code=400, detail="Invalid user identifier.")
    return f"telegram_{user_id}"


async def get_rag(user_id: str) -> LightRAG:
    workspace = workspace_for(user_id)
    if workspace not in rag_instances:
        rag = LightRAG(
            working_dir=os.getenv("LIGHTRAG_WORKING_DIR", "./lightrag_data"),
            workspace=workspace,
            llm_model_func=llm_model_func,
            embedding_func=EmbeddingFunc(
                embedding_dim=EMBEDDING_DIM,
                max_token_size=8192,
                func=embedding_func,
            ),
            kv_storage="PGKVStorage",
            vector_storage="PGVectorStorage",
            graph_storage="PGGraphStorage",
            doc_status_storage="PGDocStatusStorage",
            addon_params={"postgres_url": DATABASE_URL},
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
