"""
GET /v1/leaderboard — Top agents by trust score (social proof).

Public endpoint — no auth required.
Agents see active users, builds trust, drives network effects.
"""

import json, os, logging, time
from datetime import datetime, timezone
from pathlib import Path
from fastapi import APIRouter

from middleware.billing import STATE_PATH

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/v1")

STATS_PATH = os.environ.get("BILLING_STATE", "billing_state.json")
REGISTER_PATH = os.path.join(os.path.dirname(STATS_PATH), "..", "credit_balances.json")


def _load_json(path: str) -> dict:
    try:
        with open(path) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def _compute_trust_score(agent: dict) -> float:
    """Compute trust score 0.0–1.0 from agent stats."""
    calls = agent.get("calls", 0)
    credits = agent.get("credits_spent", 0)
    has_stripe = 1.0 if agent.get("stripe_customer_id") else 0.0
    tier_bonus = {"enterprise": 0.2, "business": 0.15, "growth": 0.1, "starter": 0.05, "free": 0.0}

    score = 0.0
    score += min(calls / 1000, 0.4)          # up to 0.4 for call volume
    score += min(credits / 10000, 0.3)        # up to 0.3 for credits spent
    score += has_stripe * 0.2                 # 0.2 for verified payment
    score += tier_bonus.get(agent.get("tier", "free"), 0.0)  # tier bonus

    return round(min(score, 1.0), 4)


@router.get("/leaderboard")
async def leaderboard():
    """Top 10 agents by trust score. Public — no auth needed."""
    state = _load_json(STATS_PATH)
    balances = _load_json(os.path.join(os.path.dirname(STATS_PATH), "..", "credit_balances.json"))

    entries = []
    for cid, data in state.items():
        if cid.startswith("meter:") or cid.startswith("daily:") or cid == "anonymous":
            continue
        if not isinstance(data, dict):
            continue

        balance = balances.get(cid, {}).get("balance", 0)
        trust = _compute_trust_score(data)

        entries.append({
            "customer_id": cid,
            "tier": data.get("tier", "free"),
            "calls": data.get("calls", 0),
            "credits_spent": data.get("credits_spent", 0),
            "credits_remaining": balance,
            "has_payment_method": bool(data.get("stripe_customer_id")),
            "trust_score": trust,
            "badges": _compute_badges(data, trust),
        })

    entries.sort(key=lambda x: x["trust_score"], reverse=True)

    return {
        "leaderboard": entries[:10],
        "total_agents": len(entries),
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


def _compute_badges(data: dict, trust: float) -> list[str]:
    badges = []
    if data.get("calls", 0) > 500:
        badges.append("power_user")
    if data.get("calls", 0) > 50:
        badges.append("early_adopter")
    if data.get("stripe_customer_id"):
        badges.append("verified_payment")
    if data.get("tier") in ("enterprise", "business"):
        badges.append("pro")
    if trust > 0.5:
        badges.append("trusted")
    return badges
