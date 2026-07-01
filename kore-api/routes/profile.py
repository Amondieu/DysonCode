"""
GET /v1/me — Agent usage dashboard (public stats).
Shows credits, calls today, top service, and plan info.
"""

import json, os, logging
from datetime import datetime, date, timezone
from fastapi import APIRouter, Header, HTTPException

from middleware.billing import STATE_PATH as BILLING_PATH
from middleware.credits import get_credits, PACKS

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/v1")


def _load_json(path: str) -> dict:
    try:
        with open(path) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def _get_daily_calls(customer_id: str, state: dict) -> int:
    today = date.today().isoformat()
    total = 0
    for key, val in state.items():
        if key.startswith(f"daily:{customer_id}:") and today in key:
            total += val
    return total


@router.get("/me")
async def my_stats(x_api_key: str = Header(None)):
    if not x_api_key:
        raise HTTPException(401, "x-api-key header required")

    # Look up customer from register.py in-memory registry
    try:
        from routes.register import _agents
        agent = _agents.get(x_api_key)
        if not agent:
            raise HTTPException(401, "Invalid API key")
        customer_id = agent["customer_id"]
    except Exception:
        raise HTTPException(401, "Invalid API key")

    state = _load_json(BILLING_PATH)
    balance = get_credits(customer_id)

    # Find monthly usage
    month_key = datetime.now(timezone.utc).strftime("%Y-%m")
    meter_key = f"meter:{customer_id}:{month_key}"
    month_entry = state.get(meter_key, {"calls": 0, "credits": 0})

    # Find top service
    top_service = "unknown"
    top_count = 0
    service_counts = {}
    for key, val in state.items():
        if key.startswith(f"daily:{customer_id}:") and ":" in key:
            parts = key.split(":")
            if len(parts) >= 3:
                svc = parts[2]
                service_counts[svc] = service_counts.get(svc, 0) + val
                if service_counts[svc] > top_count:
                    top_count = service_counts[svc]
                    top_service = svc

    return {
        "customer_id": customer_id,
        "agent_name": agent.get("agent_name", "unnamed"),
        "tier": agent.get("tier", "free"),
        "credits_remaining": balance,
        "calls_this_month": month_entry["calls"],
        "credits_used_this_month": month_entry["credits"],
        "calls_today": _get_daily_calls(customer_id, state),
        "top_service": top_service,
        "member_since": datetime.fromtimestamp(agent.get("created_at", 0), tz=timezone.utc).isoformat() if agent.get("created_at") else "unknown",
        "packs": {k: {"credits": v["credits"], "price_eur": v["price"] / 100} for k, v in PACKS.items()},
    }
