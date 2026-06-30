"""
ΦMem — Cross-Agent Memory (Qdrant-backed).

Stores and retrieves observations across sessions and agents.
Network effect: more users → better memory → higher value → more users.

Endpoints:
  POST /v1/memory/write   — Store an observation with embedding
  POST /v1/memory/recall  — Retrieve relevant memories by semantic similarity
  DELETE /v1/memory/{id}  — Remove a memory entry
"""

import uuid, logging, time, hashlib
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from middleware.auth import require_auth, AuthContext
from middleware.billing import check_and_record
from middleware.logger import log_call

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/v1/memory")

# ── Qdrant (optional — uses in-memory dict if unavailable) ──────────────

try:
    from qdrant_client import QdrantClient
    from qdrant_client.http.models import Distance, VectorParams, PointStruct
    QDRANT = QdrantClient(host=os.environ.get("QDRANT_HOST", "localhost"), port=6333)
    QDRANT.recreate_collection(
        collection_name="kore_memory",
        vectors_config=VectorParams(size=384, distance=Distance.COSINE),
    )
    HAS_QDRANT = True
except Exception:
    HAS_QDRANT = False
    logger.info("ΦMem: Qdrant unavailable, using in-memory store")

import os

# ── Simple embedding (using all-MiniLM via sentence-transformers if available) ──
_embed_model = None

def _embed(text: str) -> list[float]:
    global _embed_model
    try:
        if _embed_model is None:
            from sentence_transformers import SentenceTransformer
            _embed_model = SentenceTransformer("all-MiniLM-L6-v2")
        return _embed_model.encode(text).tolist()
    except Exception:
        # Fallback: deterministic hash-based embedding (384 dim)
        h = hashlib.sha256(text.encode()).digest()
        return [((h[i % 32] + (i * 7)) % 256) / 256.0 for i in range(384)]

# ── In-memory fallback store ────────────────────────────────────────────

_memory_store: list[dict] = []


class MemoryWriteRequest(BaseModel):
    observation: str = Field(..., max_length=16000)
    domain: str = Field(default="general", max_length=100)
    tags: list[str] = Field(default_factory=list)
    source: str = Field(default="unknown", max_length=200)

class MemoryRecallRequest(BaseModel):
    query: str = Field(..., max_length=8000)
    domain: str = Field(default="general", max_length=100)
    k: int = Field(default=5, ge=1, le=50)


@router.post("/write")
async def memory_write(req: MemoryWriteRequest, auth: AuthContext = Depends(require_auth)):
    t0 = time.time()
    billing = check_and_record(auth.tier, auth.customer_id)

    entry = {
        "id": str(uuid.uuid4()),
        "observation": req.observation,
        "domain": req.domain,
        "tags": req.tags,
        "source": req.source,
        "customer": auth.customer_id,
        "created_at": time.time(),
        "embedding": _embed(req.observation),
    }

    if HAS_QDRANT:
        from qdrant_client.http.models import PointStruct
        QDRANT.upsert("kore_memory", points=[PointStruct(
            id=entry["id"], vector=entry["embedding"],
            payload={k: v for k, v in entry.items() if k != "embedding"},
        )])
    else:
        _memory_store.append(entry)

    duration_ms = (time.time() - t0) * 1000
    log_call("POST", "/v1/memory/write", 200, duration_ms, auth.tier, auth.customer_id)
    return {"id": entry["id"], "status": "stored", "quota_remaining": billing["quota_remaining"]}


@router.post("/recall")
async def memory_recall(req: MemoryRecallRequest, auth: AuthContext = Depends(require_auth)):
    t0 = time.time()
    billing = check_and_record(auth.tier, auth.customer_id)
    query_vec = _embed(req.query)

    if HAS_QDRANT:
        results = QDRANT.search(
            "kore_memory", query_vector=query_vec, limit=req.k,
            query_filter={"must": [{"key": "domain", "match": {"value": req.domain}}]} if req.domain != "general" else None,
        )
        memories = [{"id": r.id, "score": r.score, **r.payload} for r in results]
    else:
        # Simple cosine similarity on in-memory store
        def cosine_sim(a, b):
            dot = sum(x*y for x,y in zip(a,b))
            na = sum(x*x for x in a)**0.5
            nb = sum(x*x for x in b)**0.5
            return dot/(na*nb) if na*nb > 0 else 0
        scored = [(cosine_sim(query_vec, m["embedding"]), m) for m in _memory_store
                  if req.domain == "general" or m["domain"] == req.domain]
        scored.sort(key=lambda x: -x[0])
        memories = [{"id": m["id"], "score": round(s, 4), **{k:v for k,v in m.items() if k != "embedding"}}
                    for s, m in scored[:req.k]]

    duration_ms = (time.time() - t0) * 1000
    log_call("POST", "/v1/memory/recall", 200, duration_ms, auth.tier, auth.customer_id)
    return {"memories": memories, "count": len(memories), "quota_remaining": billing["quota_remaining"]}


@router.delete("/{memory_id}")
async def memory_delete(memory_id: str, auth: AuthContext = Depends(require_auth)):
    if HAS_QDRANT:
        QDRANT.delete("kore_memory", points_selector=[memory_id])
    else:
        global _memory_store
        _memory_store = [m for m in _memory_store if m["id"] != memory_id]
    return {"status": "deleted", "id": memory_id}
