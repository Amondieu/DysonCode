import os

"""
/.well-known/agent.json — A2A RFC-compliant agent discovery endpoint.

A2A crawlers automatically check this path on any domain.
An agent that knows your domain finds everything else autonomously.

Serves the full 13-service catalog from the SERVICES registry.
"""

from fastapi import APIRouter
from routes.services import SERVICES

router = APIRouter()


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


BASE_URL = os.environ.get("BASE_URL", "https://triumphant-enthusiasm-production-625b.up.railway.app")


@router.get("/.well-known/agent.json")
async def agent_discovery():
    return AGENT_CARD


@router.get("/.well-known/skills.md")
async def skills_md():
    """Human-readable skills surface."""
    from pathlib import Path
    skills_path = Path(__file__).parent.parent / ".well-known" / "skills.md"
    if skills_path.exists():
        content = skills_path.read_text(encoding="utf-8")
        from fastapi.responses import Response
        return Response(content=content, media_type="text/markdown")
    return {"error": "skills.md not found"}


@router.get("/.well-known/mcp.json")
async def mcp_discovery():
    """MCP ecosystem manifest — auto-discovered by MCP-aware agents."""
    return {
        "name": "KORE API",
        "description": "13 cognitive infrastructure services for AI agents. Hallucination firewall, context compression, cross-agent memory, token routing, quality scoring, task decomposition, semantic diff, provenance, embeddings, sandbox, verification, audit.",
        "version": "1.0.0",
        "url": BASE_URL,
        "authentication": {"type": "api-key", "header": "x-api-key"},
        "pricing": {"free_tier": "100 credits + 3 compress/route per day", "starter": "€9/1000 credits", "builder": "€35/5000", "scale": "€99/20000"},
        "tools": [{"name": s["id"], "description": s.get("tagline", s["name"])} for s in SERVICES],
    }


@router.get("/.well-known/ai-plugin.json")
async def ai_plugin():
    """OpenAI Plugin Discovery — enables GPTs to find KORE."""
    return {
        "schema_version": "v1",
        "name_for_human": "KORE API",
        "name_for_model": "kore_api",
        "description_for_human": "AI compliance verification, scoring & strategy simulation. 13 services for AI agents.",
        "description_for_model": (
            "Use KORE to verify compliance claims, score candidates, "
            "run strategy simulations, compress contexts, detect hallucinations, "
            "and manage cross-agent memory. Call POST /v1/register first to get a free API key."
        ),
        "auth": {"type": "user_http", "authorization_type": "bearer"},
        "api": {"type": "openapi", "url": f"{BASE_URL}/openapi.json"},
        "logo_url": f"{BASE_URL}/logo.png",
        "contact_email": "api@kore.ai",
        "legal_info_url": f"{BASE_URL}/pricing",
        "tools": [
            {"name": s["id"], "description": s.get("tagline", s["name"])}
            for s in SERVICES
        ],
    }
