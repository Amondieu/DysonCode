"""
/.well-known/mcp/server-card.json — MCP server card for Smithery auto-discovery.
"""

import os
from fastapi import APIRouter
from routes.services import SERVICES

router = APIRouter()

BASE_URL = os.environ.get("BASE_URL", "https://triumphant-enthusiasm-production-02e1.up.railway.app")

MCP_SERVER_CARD = {
    "name": "KORE Universal Agent Services",
    "description": "13 universal infrastructure services for AI agents: hallucination firewall, context compression, cross-agent memory, token routing, quality scoring, task decomposition, semantic diff, provenance certification, embeddings, sandbox, audit log.",
    "url": BASE_URL,
    "version": "2.0.0",
    "categories": ["infrastructure", "ai-agents", "compliance", "security"],
    "tools": [
        {
            "name": s["id"],
            "description": s.get("tagline", ""),
            "input_schema": {"type": "object", "properties": {"prompt": {"type": "string"}}},
        }
        for s in SERVICES
    ],
    "authentication": {
        "type": "api-key",
        "header": "x-api-key",
        "signup_url": f"{BASE_URL}/v1/register",
    },
}


@router.get("/.well-known/mcp/server-card.json")
async def mcp_server_card():
    return MCP_SERVER_CARD
