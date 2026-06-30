"""
Free-tier abuse protection via in-memory rate counters.

Without this, a single bot drains all free provider budgets in minutes.

LIMITS:
  unregistered:  50/day,   10/hour  (IP-based)
  free:        1000/day,  100/hour  (API key)
  paid:           0/day,    0/hour  (unlimited)
"""

import time, logging
from collections import defaultdict
from datetime import date, datetime
from fastapi import Request, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger(__name__)

LIMITS = {
    "unregistered": {"day": 50,   "hour": 10},
    "free":         {"day": 1000, "hour": 100},
    "starter":      {"day": 50000, "hour": 5000},
    "growth":       {"day": 300000, "hour": 30000},
    "business":     {"day": 2000000, "hour": 200000},
    "enterprise":   {"day": 0, "hour": 0},  # 0 = unlimited
}

# In-memory counters: {key: {"date": "2026-06-30", "day": N, "hour": N, "hour_key": "15"}}
_counters: dict[str, dict] = defaultdict(lambda: {"date": "", "day": 0, "hour": 0, "hour_key": ""})


def _get_tier(request: Request) -> str:
    """Extract tier from request state (set by auth middleware)."""
    return getattr(request.state, "tier", "unregistered")


def _get_key(request: Request) -> str:
    """Get rate limit key: API key or IP fallback."""
    api_key = getattr(request.state, "api_key", None)
    if api_key:
        return f"key:{api_key}"
    client = request.client.host if request.client else "unknown"
    return f"ip:{client}"


def _check_and_increment(key: str, tier: str) -> bool:
    """Check quota and increment counter. Returns True if allowed."""
    limits = LIMITS.get(tier, LIMITS["unregistered"])
    today = date.today().isoformat()
    now = datetime.now()
    hour_key = f"{today}:{now.hour}"

    c = _counters[key]

    # Reset if new day/hour
    if c["date"] != today:
        c["date"] = today
        c["day"] = 0
        c["hour"] = 0
        c["hour_key"] = hour_key
    if c["hour_key"] != hour_key:
        c["hour"] = 0
        c["hour_key"] = hour_key

    # Check limits (0 = unlimited)
    if limits["day"] > 0 and c["day"] >= limits["day"]:
        return False
    if limits["hour"] > 0 and c["hour"] >= limits["hour"]:
        return False

    # Increment
    c["day"] += 1
    c["hour"] += 1
    return True


class QuotaMiddleware(BaseHTTPMiddleware):
    """Rate limiting middleware — enforces per-tier daily/hourly quotas."""

    async def dispatch(self, request: Request, call_next):
        # Skip health endpoint
        if request.url.path == "/health":
            return await call_next(request)

        tier = _get_tier(request)
        key = _get_key(request)

        if not _check_and_increment(key, tier):
            limits = LIMITS.get(tier, LIMITS["unregistered"])
            logger.warning(f"Quota exceeded: tier={tier} key={key[:20]} day={limits['day']}")
            from fastapi.responses import JSONResponse
            return JSONResponse(
                status_code=429,
                content={"error": "rate_limit", "detail": f"Daily limit exceeded for tier '{tier}'",
                         "limit": limits["day"], "retry_after_seconds": 86400},
            )

        response = await call_next(request)
        return response
