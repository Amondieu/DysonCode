"""
GET /v1/services — Complete service catalog for agent discovery.

Returns all 13 universal services with descriptions, pricing,
and protocol support. Auto-discovered by A2A/MCP crawlers.
"""

from fastapi import APIRouter

router = APIRouter(prefix="/v1")

SERVICES = [
    {"id": "guard", "symbol": "ΨGuard", "name": "Hallucination Firewall",
     "endpoint": "POST /v1/guard", "score": 8.94,
     "tagline": "Last gate before agent output emission. Flags unsupported claims.",
     "pricing": "$0.0005/call", "free_tier": 1000},

    {"id": "compress", "symbol": "ΔPack", "name": "Context Compression",
     "endpoint": "POST /v1/compress", "score": 9.0,
     "tagline": "3-5x semantic compression without quality loss.",
     "pricing": "$0.003/call", "free_tier": 10000},

    {"id": "dedup", "symbol": "ΩDeDup", "name": "Semantic Deduplication",
     "endpoint": "Coming soon", "score": 7.5,
     "tagline": "Cosine-similarity duplicate detection for RAG ingestion.",
     "pricing": "$0.001/call", "free_tier": 5000},

    {"id": "memory", "symbol": "ΦMem", "name": "Cross-Agent Memory",
     "endpoint": "POST /v1/memory/write, /recall", "score": 9.11,
     "tagline": "Shared Qdrant-backed memory across all agents. Network effect.",
     "pricing": "$0.002/write, $0.001/recall", "free_tier": 1000},

    {"id": "route", "symbol": "ΞRoute", "name": "Token Cost Arbitrage",
     "endpoint": "POST /v1/route", "score": 8.0,
     "tagline": "Routes to cheapest model that meets quality threshold.",
     "pricing": "$0.0001/call", "free_tier": 10000},

    {"id": "normalize", "symbol": "ΛNorm", "name": "Prompt Normalizer",
     "endpoint": "POST /v1/normalize", "score": 8.7,
     "tagline": "Strips noise, detects injections, normalizes whitespace.",
     "pricing": "$0.0001/call", "free_tier": 10000},

    {"id": "score", "symbol": "ΘScore", "name": "Output Quality Scorer",
     "endpoint": "POST /v1/score", "score": 8.5,
     "tagline": "Ranks multiple candidate outputs by heuristic quality.",
     "pricing": "$0.02/call", "free_tier": 500},

    {"id": "split", "symbol": "ΣSplit", "name": "Task Decomposer",
     "endpoint": "POST /v1/split", "score": 8.3,
     "tagline": "Splits complex tasks into parallel subtasks.",
     "pricing": "$0.005/call", "free_tier": 1000},

    {"id": "diff", "symbol": "ΓDiff", "name": "Semantic Diff Engine",
     "endpoint": "POST /v1/diff", "score": 7.8,
     "tagline": "Meaning-preserving diff between two text outputs.",
     "pricing": "$0.005/call", "free_tier": 1000},

    {"id": "provenance", "symbol": "ΠProve", "name": "Claim Provenance",
     "endpoint": "POST /v1/provenance/certify", "score": 8.85,
     "tagline": "EU AI Act compliant provenance certificates with hash chains.",
     "pricing": "$0.01/certify", "free_tier": 500},

    {"id": "embed", "symbol": "ΦEmbed", "name": "Embedding Cache",
     "endpoint": "POST /v1/embed", "score": 7.6,
     "tagline": "LRU-cached embeddings via all-MiniLM. Zero recomputation.",
     "pricing": "$0.001/call", "free_tier": 5000},

    {"id": "sandbox", "symbol": "ΨSandbox", "name": "Agent Sandbox",
     "endpoint": "POST /v1/sandbox/exec", "score": 8.82,
     "tagline": "Safe code execution. No Docker needed. 30s timeout.",
     "pricing": "$0.005/exec", "free_tier": 100},

    {"id": "audit", "symbol": "ΩAudit", "name": "Immutable Audit Log",
     "endpoint": "GET /v1/audit/trail", "score": 9.15,
     "tagline": "HMAC-SHA256 chained audit trail. EU AI Act compliant.",
     "pricing": "Included", "free_tier": "unlimited"},
]


@router.get("/services")
async def list_services():
    return {
        "services": SERVICES,
        "count": len(SERVICES),
        "catalog_version": "1.0.0",
    }
