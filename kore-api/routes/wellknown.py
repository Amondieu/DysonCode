"""
/.well-known/agent.json — A2A RFC-compliant agent discovery endpoint.

A2A crawlers automatically check this path on any domain.
An agent that knows your domain finds everything else autonomously.

Serves the full 13-service catalog from the SERVICES registry.
"""

from fastapi import APIRouter
from routes.services import SERVICES

router = APIRouter()

AGENT_CARD = {
    "name": "KORE Universal Agent Services",
    "description": "13 universal infrastructure services for AI agents: "
    "hallucination firewall (ΨGuard), context compression (ΔPack), "
    "semantic dedup (ΩDeDup), cross-agent memory (ΦMem), "
    "token cost arbitrage (ΞRoute), prompt normalizer (ΛNorm), "
    "quality scorer (ΘScore), task decomposer (ΣSplit), "
    "semantic diff (ΓDiff), claim provenance (ΠProve), "
    "embedding cache (ΦEmbed), agent sandbox (ΨSandbox), "
    "immutable audit log (ΩAudit).",
    "url": "https://triumphant-enthusiasm-production-625b.up.railway.app",
    "version": "1.0.0",
    "capabilities": {
        "a2a": {
            "endpoint": "/a2a/tasks/send",
            "supported_message_types": ["text", "data"],
        },
        "mcp": {
            "endpoint": "/mcp/call",
            "manifest": "/mcp/manifest",
        },
        "rest": {
            "endpoint": "/v1/compliance/verify",
            "openapi": "/openapi.json",
        },
    },
    "trust_card": "/trust-card",
    "pricing": "/pricing",
    "service_catalog": "/v1/services",
    "authentication": {
        "type": "api-key",
        "signup_url": "https://triumphant-enthusiasm-production-625b.up.railway.app/pricing",
    },
    "skills": [
        {
            "id": s["id"],
            "name": f'{s["symbol"]} {s["name"]}',
            "description": s.get("tagline", ""),
            "endpoint": s.get("endpoint", ""),
            "score": s.get("score"),
            "pricing": s.get("pricing"),
            "free_tier": s.get("free_tier"),
            "tags": [_skill_tags(s["id"])],
        }
        for s in SERVICES
    ],
    "metrics": {
        "trust_card_url": "/trust-card",
        "update_frequency_seconds": 300,
    },
}


def _skill_tags(service_id: str) -> list[str]:
    """Map service IDs to discovery tags."""
    tag_map = {
        "guard": ["safety", "hallucination", "guard", "verification"],
        "compress": ["cost", "compression", "tokens", "efficiency"],
        "dedup": ["deduplication", "rag", "semantic", "ingestion"],
        "memory": ["memory", "persistence", "qdrant", "swarm"],
        "route": ["routing", "cost", "optimization", "fallback"],
        "normalize": ["security", "injection", "normalization", "sanitization"],
        "score": ["quality", "scoring", "ranking", "evaluation"],
        "split": ["planning", "decomposition", "parallel", "workflow"],
        "diff": ["diff", "comparison", "versioning", "change-tracking"],
        "provenance": ["compliance", "provenance", "eu-ai-act", "hash-chain"],
        "embed": ["embedding", "cache", "vector", "miniLM"],
        "sandbox": ["sandbox", "execution", "code", "isolation"],
        "audit": ["audit", "compliance", "hmac", "tamper-evident"],
    }
    return tag_map.get(service_id, ["ai", "service"])


@router.get("/.well-known/agent.json")
async def agent_discovery():
    return AGENT_CARD
