"""
Bearer-token + x-api-key authentication with tier-based access control.

Accepts API keys via:
  - Authorization: Bearer <key>
  - x-api-key: <key>  (Smithery-compatible)

Tiers:
    free:       10k calls/month (no API key needed for dev)
    starter:    50k calls/month,  €149
    growth:    300k calls/month,  €690
    business:    2M calls/month, €1,990
    enterprise:  unlimited, custom pricing

Usage:
    from middleware.auth import require_auth
    @app.post("/v1/verify")
    async def endpoint(key=Depends(require_auth)):
        ...
"""

import os, logging
from dataclasses import dataclass
from fastapi import HTTPException, Depends, Request, Header

logger = logging.getLogger(__name__)

MASTER_KEY = os.environ.get("KORE_API_KEY", "dev-test-key-local")

TIERS = {
    "free":      {"monthly_calls": 10_000,  "price": 0},
    "starter":   {"monthly_calls": 50_000,  "price": 149},
    "growth":    {"monthly_calls": 300_000, "price": 690},
    "business":  {"monthly_calls": 2_000_000,"price": 1990},
    "enterprise":{"monthly_calls": 10_000_000,"price": 0},
}


@dataclass
class AuthContext:
    key: str
    tier: str
    customer_id: str
    calls_this_month: int = 0


async def require_auth(
    request: Request,
    authorization: str = Header(None),
    x_api_key: str = Header(None),
) -> AuthContext:
    # 1. Try x-api-key header first (Smithery-compatible)
    token = None
    if x_api_key:
        token = x_api_key
    # 2. Fall back to Authorization: Bearer
    elif authorization and authorization.startswith("Bearer "):
        token = authorization.replace("Bearer ", "").strip()

    if token is None:
        if request.method == "GET":
            return AuthContext(key="anon", tier="free", customer_id="anonymous")
        raise HTTPException(401, "Missing API key. Send x-api-key header or Authorization: Bearer <key>")

    if token == MASTER_KEY:
        return AuthContext(key=token, tier="enterprise", customer_id="admin")

    raise HTTPException(401, "Invalid API key. Get one at https://api.kore.ai/pricing")
