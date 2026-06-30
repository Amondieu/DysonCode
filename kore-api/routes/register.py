"""
POST /v1/register — Agent registration with API key + free credits.

Generates a new API key, activates the free tier (100 credits),
and returns the key + account details.

Usage:
    curl -X POST https://kore-api.up.railway.app/v1/register \\
      -H "Content-Type: application/json" \\
      -d '{"agent_name": "My Agent", "email": "user@example.com"}'
"""

import uuid, logging, os, time
from fastapi import APIRouter, HTTPException

from middleware.credits import activate_free_tier, PACKS

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/v1")

# In-memory agent registry (keys are stored here)
# In production, replace with billing_pg PostgreSQL backend
_agents: dict[str, dict] = {}

MASTER_KEY = os.environ.get("KORE_API_KEY", "dev-test-key-local")


@router.post("/register")
async def register_agent(payload: dict):
    agent_name = payload.get("agent_name", "unnamed-agent")
    email = payload.get("email", "")

    if not email:
        raise HTTPException(400, "email is required")

    # Generate a unique API key
    api_key = f"kore_{uuid.uuid4().hex}"

    customer_id = f"cust_{uuid.uuid4().hex[:12]}"

    # Activate free tier (100 credits)
    activate_free_tier(customer_id)

    # Store agent
    _agents[api_key] = {
        "customer_id": customer_id,
        "agent_name": agent_name,
        "email": email,
        "created_at": time.time(),
        "tier": "free",
        "credits": PACKS["free"]["credits"],
    }

    logger.info(f"Registered agent: {agent_name} ({email}) → {customer_id}")

    return {
        "status": "ok",
        "api_key": api_key,
        "customer_id": customer_id,
        "credits": PACKS["free"]["credits"],
        "tier": "free",
        "endpoints": {
            "buy_credits": "GET /buy/{pack}",
            "check_balance": "GET /v1/balance",
            "service_catalog": "GET /v1/services",
        },
    }


@router.get("/register")
async def register_info():
    """Return registration instructions."""
    return {
        "endpoint": "POST /v1/register",
        "body": {
            "agent_name": "string (required)",
            "email": "string (required)",
        },
        "response": {
            "api_key": "your-kore-api-key",
            "credits": 100,
            "tier": "free",
        },
        "packs": {k: {"credits": v["credits"], "price_eur_cents": v["price"]} for k, v in PACKS.items()},
    }
