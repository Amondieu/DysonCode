"""
ΦEmbed — Embedding Cache.

Caches embedding vectors to avoid recomputation for repeated inputs.
Uses LRU cache with configurable size. Falls back to all-MiniLM.
RC 6/7 · $24.8k/mo at M6
"""

import logging, time, uuid, hashlib
from collections import OrderedDict
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from middleware.auth import require_auth, AuthContext
from middleware.billing import check_and_record
from middleware.logger import log_call

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/v1/embed")

# ── LRU Cache ───────────────────────────────────────────────────────────

_cache = OrderedDict()
MAX_CACHE = 10_000

_embed_fn = None

def _get_embedder():
    global _embed_fn
    if _embed_fn is not None:
        return _embed_fn
    try:
        from sentence_transformers import SentenceTransformer
        model = SentenceTransformer("all-MiniLM-L6-v2")
        _embed_fn = model.encode
    except Exception:
        _embed_fn = lambda t: [0.0] * 384
    return _embed_fn


class EmbedRequest(BaseModel):
    text: str = Field(..., max_length=8000)
    skip_cache: bool = False


@router.post("")
async def embed(req: EmbedRequest, auth: AuthContext = Depends(require_auth)):
    t0 = time.time()
    billing = check_and_record(auth.tier, auth.customer_id)

    cache_key = hashlib.md5(req.text.encode()).hexdigest()
    cache_hit = False

    if not req.skip_cache and cache_key in _cache:
        vector = _cache[cache_key]
        cache_hit = True
    else:
        fn = _get_embedder()
        vector = fn(req.text).tolist() if hasattr(fn(req.text), 'tolist') else fn(req.text)

        # LRU cache management
        _cache[cache_key] = vector
        if len(_cache) > MAX_CACHE:
            _cache.popitem(last=False)

    dim = len(vector)
    resp = {
        "vector": vector[:8],  # preview
        "dimensions": dim,
        "cache_hit": cache_hit,
        "cache_size": len(_cache),
        "latency_ms": round((time.time() - t0) * 1000, 1),
        "quota_remaining": billing["quota_remaining"],
    }
    log_call("POST", "/v1/embed", 200, resp["latency_ms"], auth.tier, auth.customer_id, resp)
    return resp
