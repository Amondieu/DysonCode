"""
kore-api/routes/mcp_v2.py — MCP v2 integration router
======================================================
Wires the MCP v2 protocol (latency-optimized route/recall, x-credits-per-call
metadata, suggested_next_tool, budget hints) into the existing kore-api app.

Items covered:
  1. Latency: route + memory_recall in-process cache (<50ms)
  2. MCP schema: tools/list with x-credits-per-call + x-latency-sla-ms
  3. suggested_next_tool in every tool response
  4. dry_run=true on every endpoint
  5. x-kore-credits + x-kore-pool-remaining response headers
  6. Budget hints: credits_remaining + estimated_task_completion
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any, Optional

from fastapi import APIRouter, Request, Response
from fastapi.responses import JSONResponse

from billing_v2 import CREDIT_WEIGHTS, deduct, eur_cost, Wallet, TierID

router = APIRouter(prefix="/v2/mcp", tags=["mcp-v2"])

# ── Tool registry ─────────────────────────────────────────────────────────────

TOOL_META: dict[str, dict] = {
    "route": {
        "description": "Deterministic intent → agent routing. 2cr. Fastest KORE op.",
        "latency_sla_ms": 40,
        "suggested_next": ["memory_recall", "guard"],
        "input_schema": {
            "type": "object",
            "properties": {
                "intent":    {"type": "string", "description": "Raw intent or parsed text"},
                "context":   {"type": "object", "description": "Optional routing context"},
                "dry_run":   {"type": "boolean", "default": False},
            },
            "required": ["intent"],
        },
    },
    "memory_recall": {
        "description": "Long-term semantic memory retrieval. 1cr. Cheapest retrieval in KORE.",
        "latency_sla_ms": 45,
        "suggested_next": ["compress", "route"],
        "input_schema": {
            "type": "object",
            "properties": {
                "query":      {"type": "string"},
                "top_k":      {"type": "integer", "default": 5},
                "tenant_id":  {"type": "string"},
                "dry_run":    {"type": "boolean", "default": False},
            },
            "required": ["query"],
        },
    },
    "memory_write": {
        "description": "Persist agent memory. 2cr. Feeds the memory lock-in flywheel.",
        "latency_sla_ms": 80,
        "suggested_next": ["memory_recall", "compress"],
        "input_schema": {
            "type": "object",
            "properties": {
                "content":   {"type": "string"},
                "labels":    {"type": "array", "items": {"type": "string"}},
                "tenant_id": {"type": "string"},
                "dry_run":   {"type": "boolean", "default": False},
            },
            "required": ["content"],
        },
    },
    "guard": {
        "description": "Policy + risk classification before execution. 3cr.",
        "latency_sla_ms": 60,
        "suggested_next": ["route", "sandbox_exec"],
        "input_schema": {
            "type": "object",
            "properties": {
                "payload": {"type": "object"},
                "policy":  {"type": "string", "enum": ["standard", "strict"]},
                "dry_run": {"type": "boolean", "default": False},
            },
            "required": ["payload"],
        },
    },
    "embed": {
        "description": "BGE-M3 semantic embedding. 1cr. Self-hosted — zero pass-through cost.",
        "latency_sla_ms": 30,
        "suggested_next": ["memory_write", "diff"],
        "input_schema": {
            "type": "object",
            "properties": {
                "text":    {"type": "string"},
                "dry_run": {"type": "boolean", "default": False},
            },
            "required": ["text"],
        },
    },
    "compress": {
        "description": "IDEVA Ω lossless compression operator. 2cr. Unique — no market equivalent.",
        "latency_sla_ms": 70,
        "suggested_next": ["memory_write", "route"],
        "input_schema": {
            "type": "object",
            "properties": {
                "content":        {"type": "string"},
                "target_ratio":   {"type": "number", "default": 0.5},
                "dry_run":        {"type": "boolean", "default": False},
            },
            "required": ["content"],
        },
    },
    "diff": {
        "description": "Semantic diff between two texts or memory states. 4cr.",
        "latency_sla_ms": 90,
        "suggested_next": ["verify", "score"],
        "input_schema": {
            "type": "object",
            "properties": {
                "a":       {"type": "string"},
                "b":       {"type": "string"},
                "dry_run": {"type": "boolean", "default": False},
            },
            "required": ["a", "b"],
        },
    },
    "split": {
        "description": "Goal decomposition into DAG subtasks. 8cr.",
        "latency_sla_ms": 150,
        "suggested_next": ["route", "sandbox_exec"],
        "input_schema": {
            "type": "object",
            "properties": {
                "goal":    {"type": "string"},
                "depth":   {"type": "integer", "default": 2},
                "dry_run": {"type": "boolean", "default": False},
            },
            "required": ["goal"],
        },
    },
    "normalize": {
        "description": "Text normalization and schema validation. 1cr.",
        "latency_sla_ms": 20,
        "suggested_next": ["embed", "route"],
        "input_schema": {
            "type": "object",
            "properties": {
                "text":    {"type": "string"},
                "schema":  {"type": "object"},
                "dry_run": {"type": "boolean", "default": False},
            },
            "required": ["text"],
        },
    },
    "sandbox_exec": {
        "description": "Managed secure code execution with A2A context + audit log. 10cr.",
        "latency_sla_ms": 400,
        "suggested_next": ["verify", "score"],
        "input_schema": {
            "type": "object",
            "properties": {
                "code":      {"type": "string"},
                "language":  {"type": "string", "enum": ["python", "javascript", "bash"]},
                "timeout_s": {"type": "integer", "default": 30},
                "dry_run":   {"type": "boolean", "default": False},
            },
            "required": ["code"],
        },
    },
    "score": {
        "description": "Structured quality scoring with IDEVA schema. 20cr. Local inference.",
        "latency_sla_ms": 200,
        "suggested_next": ["verify", "memory_write"],
        "input_schema": {
            "type": "object",
            "properties": {
                "content":    {"type": "string"},
                "criteria":   {"type": "array", "items": {"type": "string"}},
                "dry_run":    {"type": "boolean", "default": False},
            },
            "required": ["content"],
        },
    },
    "verify": {
        "description": "ΦΩΡΓΕ adversarial verification with structured pass/fail verdict. 36cr.",
        "latency_sla_ms": 500,
        "suggested_next": ["provenance_certify", "memory_write"],
        "input_schema": {
            "type": "object",
            "properties": {
                "claim":     {"type": "string"},
                "evidence":  {"type": "array"},
                "dry_run":   {"type": "boolean", "default": False},
            },
            "required": ["claim"],
        },
    },
    "provenance_certify": {
        "description": "Immutable provenance certificate for compliance/audit chains. 12cr.",
        "latency_sla_ms": 120,
        "suggested_next": ["memory_write"],
        "input_schema": {
            "type": "object",
            "properties": {
                "artifact_id": {"type": "string"},
                "content_hash":{"type": "string"},
                "dry_run":     {"type": "boolean", "default": False},
            },
            "required": ["artifact_id"],
        },
    },
}

# ── In-process route/recall cache (latency optimization) ──────────────────────


@dataclass
class CacheEntry:
    result: Any
    expires_at: float


_ROUTE_CACHE:  dict[str, CacheEntry] = {}
_RECALL_CACHE: dict[str, CacheEntry] = {}
_ROUTE_CACHE_TTL_S  = 5.0
_RECALL_CACHE_TTL_S = 2.0


def _cache_get(cache: dict, key: str) -> Optional[Any]:
    entry = cache.get(key)
    if entry and time.monotonic() < entry.expires_at:
        return entry.result
    if entry:
        del cache[key]
    return None


def _cache_set(cache: dict, key: str, value: Any, ttl: float) -> None:
    cache[key] = CacheEntry(result=value, expires_at=time.monotonic() + ttl)


# ── tools/list endpoint ───────────────────────────────────────────────────────


@router.get("/tools/list")
async def tools_list():
    """
    MCP tools/list — returns full schema + credit metadata for all KORE tools.
    Agent frameworks (LangChain, AutoGen, LlamaIndex) use this for auto-discovery.
    """
    tools = []
    for name, meta in TOOL_META.items():
        tools.append({
            "name": name,
            "description": meta["description"],
            "inputSchema":  meta["input_schema"],
            "x-credits-per-call":  CREDIT_WEIGHTS.get(name, 0),
            "x-cost-eur-per-call": eur_cost(name),
            "x-latency-sla-ms":    meta["latency_sla_ms"],
            "x-suggested-next":    meta["suggested_next"],
            "x-dry-run-supported": True,
        })
    return {
        "tools": tools,
        "meta": {
            "credit_unit_eur": 0.001,
            "overage_eur_per_credit": 0.001,
            "tiers": {
                "dev":           {"eur_per_month": 9.00,  "credits_per_month": 1200},
                "pro":           {"eur_per_month": 35.00, "credits_per_month": 6000},
                "memory_bundle": {"eur_per_month": 9.00,  "credits_per_month": 1200,
                                  "scope": ["memory_recall", "memory_write"]},
            },
        },
    }


# ── Response builder ──────────────────────────────────────────────────────────


def _build_response(
    tool_name:  str,
    result:     dict,
    wallet:     Wallet,
    dry_run:    bool,
    start_ns:   int,
) -> dict:
    """Attach billing metadata + suggested_next_tool to any tool result."""
    meta    = TOOL_META[tool_name]
    deducted = deduct(wallet, tool_name, dry_run=dry_run)
    elapsed_ms = (time.perf_counter_ns() - start_ns) // 1_000_000

    pool_total = sum(wallet.subscription_pool.values())
    remaining  = pool_total + wallet.prepaid_balance

    # Estimate credits to task completion (heuristic: avg 4cr/step × estimated remaining steps)
    estimated_completion = remaining // 4 if remaining > 0 else 0

    return {
        **result,
        "suggested_next_tool":       meta["suggested_next"][0] if meta["suggested_next"] else None,
        "suggested_next_options":    meta["suggested_next"],
        "credits_used":              deducted["credits_used"],
        "credits_remaining":         remaining - (0 if dry_run else deducted["credits_used"]),
        "estimated_task_completion": estimated_completion,
        "payg_eur":                  deducted["payg_eur"],
        "latency_ms":                elapsed_ms,
        "dry_run":                   dry_run,
        "_meta": {
            "sla_ms":     meta["latency_sla_ms"],
            "sla_met":    elapsed_ms <= meta["latency_sla_ms"],
        },
    }


def _set_credit_headers(response: Response, result: dict) -> None:
    response.headers["x-kore-credits-used"]       = str(result.get("credits_used", 0))
    response.headers["x-kore-credits-remaining"]   = str(result.get("credits_remaining", 0))
    response.headers["x-kore-latency-ms"]          = str(result.get("latency_ms", 0))
    response.headers["x-kore-sla-met"]             = str(result.get("_meta", {}).get("sla_met", True)).lower()
    response.headers["x-kore-suggested-next"]      = result.get("suggested_next_tool") or ""


def _default_wallet() -> Wallet:
    return Wallet(tenant_id="anon", subscription_pool={}, prepaid_balance=9999)


# ── Route endpoint (latency-optimized with cache) ─────────────────────────────


def _route_logic(intent: str, context: dict) -> dict:
    """
    Deterministic intent → agent routing.
    Target latency: <10ms in-process.
    """
    intent_lower = intent.lower()
    if any(k in intent_lower for k in ("remember", "recall", "memory", "context")):
        target = "context_memory_agent"
    elif any(k in intent_lower for k in ("execute", "run", "code", "script")):
        target = "execution_agent_code"
    elif any(k in intent_lower for k in ("search", "find", "research", "lookup")):
        target = "research_insight_agent"
    elif any(k in intent_lower for k in ("verify", "check", "validate", "certify")):
        target = "verifier_qa_agent"
    elif any(k in intent_lower for k in ("plan", "decompose", "split", "break")):
        target = "planner_decomposer_agent"
    else:
        target = "intake_router_agent"
    return {"target": target, "confidence": 0.85}


@router.post("/tools/call/route")
async def call_route(body: dict, response: Response):
    start = time.perf_counter_ns()
    intent   = body.get("intent", "")
    dry_run  = body.get("dry_run", False)

    cache_key = intent.strip().lower()[:128]
    cached = _cache_get(_ROUTE_CACHE, cache_key)

    if cached:
        raw_result = cached
        response.headers["x-kore-cache"] = "hit"
    else:
        raw_result = _route_logic(intent, body.get("context", {}))
        _cache_set(_ROUTE_CACHE, cache_key, raw_result, _ROUTE_CACHE_TTL_S)
        response.headers["x-kore-cache"] = "miss"

    wallet = _default_wallet()
    result = _build_response("route", raw_result, wallet, dry_run, start)
    _set_credit_headers(response, result)
    return result


# ── Memory recall endpoint (latency-optimized with cache) ─────────────────────


async def _recall_logic(query: str, top_k: int) -> dict:
    """
    Vector similarity search against memory store.
    Replace with your actual vector DB call (pgvector, Qdrant, Weaviate).
    Target latency: <30ms for cached embeddings, <45ms total.
    """
    return {"results": [], "query": query, "top_k": top_k}


@router.post("/tools/call/memory_recall")
async def call_memory_recall(body: dict, response: Response):
    start    = time.perf_counter_ns()
    query    = body.get("query", "")
    top_k    = body.get("top_k", 5)
    dry_run  = body.get("dry_run", False)

    cache_key = f"{query.strip().lower()[:128]}:{top_k}"
    cached    = _cache_get(_RECALL_CACHE, cache_key)

    if cached:
        raw_result = cached
        response.headers["x-kore-cache"] = "hit"
    else:
        raw_result = await _recall_logic(query, top_k)
        _cache_set(_RECALL_CACHE, cache_key, raw_result, _RECALL_CACHE_TTL_S)
        response.headers["x-kore-cache"] = "miss"

    wallet = _default_wallet()
    result = _build_response("memory_recall", raw_result, wallet, dry_run, start)
    _set_credit_headers(response, result)
    return result


# ── Generic passthrough for all other tools ───────────────────────────────────


async def _dispatch_tool(name: str, body: dict) -> dict:
    """Wire your actual tool implementations here. Stubs for illustration."""
    return {"status": "ok", "tool": name}


@router.post("/tools/call/{tool_name}")
async def call_tool(tool_name: str, body: dict, response: Response):
    if tool_name not in TOOL_META:
        return JSONResponse(
            status_code=404,
            content={"error": f"Unknown tool: {tool_name!r}",
                     "available": list(TOOL_META.keys())},
        )

    start   = time.perf_counter_ns()
    dry_run = body.get("dry_run", False)

    wallet = _default_wallet()
    raw_result = await _dispatch_tool(tool_name, body)
    result     = _build_response(tool_name, raw_result, wallet, dry_run, start)
    _set_credit_headers(response, result)
    return result


# ── wallet_summary (free, no credits) ─────────────────────────────────────────


@router.get("/wallet/summary/{tenant_id}")
async def wallet_summary(tenant_id: str):
    """
    Free endpoint. No credits charged.
    Returns current pool state, usage breakdown, and suggested upgrade.
    """
    return {
        "tenant_id":         tenant_id,
        "subscription_pool": {},
        "prepaid_balance":   0,
        "usage_30d":         {},
        "suggested_upgrade": None,
        "_note": "Wire to WalletStore.get_summary(tenant_id)",
    }


# ── Health ────────────────────────────────────────────────────────────────────


@router.get("/health")
async def health():
    return {"status": "ok", "version": "2.0.0", "tools": len(TOOL_META)}
