"""
Credit tracking system for all 13 KORE services.

1 credit = €0.001
Each service costs a fixed number of credits per call.

Packs:
  Free:      100 credits    (€0,    €0.009/credit)
  Starter:   1,000 credits  (€9,    €0.009/credit)
  Builder:   5,000 credits  (€35,   €0.007/credit)
  Scale:     20,000 credits (€99,   €0.005/credit)
  Enterprise: 100,000 cr.   (€399,  €0.004/credit)
"""

import json, os, logging, time
from pathlib import Path
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

STATE_FILE = os.environ.get("CREDIT_STATE", "credit_balances.json")

# ── Cost per call (in credits) ──────────────────────────────────────────

SERVICE_COSTS = {
    "guard": 4, "compress": 3, "route": 5, "score": 40,
    "verify": 72, "memory_write": 2, "memory_recall": 1,
    "normalize": 1, "split": 10, "diff": 5, "embed": 2,
    "sandbox_exec": 20, "provenance_certify": 15,
}

# Default cost for unknown services
DEFAULT_COST = 5

# ── Pack definitions ────────────────────────────────────────────────────

PACKS = {
    "free":       {"credits": 100,    "price": 0,    "stripe_id": "free"},
    "starter":    {"credits": 1000,   "price": 900,  "stripe_id": "price_starter"},
    "builder":    {"credits": 5000,   "price": 3500, "stripe_id": "price_builder"},
    "scale":      {"credits": 20000,  "price": 9900, "stripe_id": "price_scale"},
    "enterprise": {"credits": 100000, "price": 39900,"stripe_id": "price_enterprise"},
}


def _load_balances() -> dict:
    try:
        with open(STATE_FILE) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def _save_balances(state: dict):
    os.makedirs(Path(STATE_FILE).parent, exist_ok=True)
    with open(STATE_FILE, "w") as f:
        json.dump(state, f, indent=2)


def get_credits(customer_id: str) -> int:
    state = _load_balances()
    return state.get(customer_id, {}).get("balance", 0)


def add_credits(customer_id: str, amount: int, source: str = "purchase"):
    state = _load_balances()
    entry = state.setdefault(customer_id, {"balance": 0, "history": []})
    entry["balance"] += amount
    entry["history"].append({"ts": time.time(), "delta": amount, "source": source})
    _save_balances(state)
    logger.info(f"Credits: +{amount} for {customer_id} (balance: {entry['balance']})")


def spend_credits(customer_id: str, service: str) -> bool:
    """Spend credits for a service call. Returns True if enough credits."""
    cost = SERVICE_COSTS.get(service, DEFAULT_COST)
    state = _load_balances()
    entry = state.setdefault(customer_id, {"balance": 0, "history": []})

    if entry["balance"] < cost:
        logger.warning(f"Credits: insufficient for {customer_id} ({entry['balance']} < {cost})")
        return False

    entry["balance"] -= cost
    entry["history"].append({"ts": time.time(), "delta": -cost, "source": service})
    _save_balances(state)
    return True


def activate_free_tier(customer_id: str):
    """Give free tier credits to a new customer."""
    state = _load_balances()
    if customer_id not in state:
        add_credits(customer_id, PACKS["free"]["credits"], source="free_tier")
