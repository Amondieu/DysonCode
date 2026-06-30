"""
Per-call Stripe Meter billing + quota enforcement.

Layer 1 — Pay-as-you-go:
  Every API call reports cost to Stripe Meter Event.
  No prepaid credits needed. Agents start immediately.
  Stripe aggregates and invoices at month end.

Quota enforcement (soft cap):
    free:       10k calls/month
    starter:    50k calls/month
    growth:    300k calls/month
    business:    2M calls/month
    enterprise:  unlimited
"""

import json, os, logging
from datetime import datetime, timezone
from pathlib import Path

logger = logging.getLogger(__name__)

STATE_PATH = os.environ.get("BILLING_STATE", "billing_state.json")
STRIPE_KEY = os.environ.get("STRIPE_SECRET_KEY", "")

TIERS = {
    "free":      10_000,
    "starter":   50_000,
    "growth":   300_000,
    "business": 2_000_000,
    "enterprise": 10_000_000,
}

# Service credit costs (1 credit = €0.001)
SERVICE_COSTS = {
    "guard": 4, "compress": 3, "route": 5, "score": 40,
    "verify": 72, "memory_write": 2, "memory_recall": 1,
    "normalize": 1, "split": 10, "diff": 5, "embed": 2,
    "sandbox_exec": 20, "provenance_certify": 15,
}
DEFAULT_COST = 5


def _load_state() -> dict:
    try:
        with open(STATE_PATH) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def _save_state(state: dict):
    os.makedirs(Path(STATE_PATH).parent, exist_ok=True)
    with open(STATE_PATH, "w") as f:
        json.dump(state, f, indent=2)


def _get_or_create_customer(customer_id: str, state: dict) -> dict:
    """Get or create customer entry with Stripe customer ID."""
    return state.setdefault(customer_id, {
        "stripe_customer_id": None,
        "calls": 0,
        "credits_spent": 0,
        "tier": "free",
    })


def _report_to_stripe_meter(stripe_customer_id: str, cost: int):
    """Report a metered event to Stripe for per-call billing."""
    if not STRIPE_KEY or not stripe_customer_id:
        return
    try:
        import stripe
        stripe.api_key = STRIPE_KEY
        stripe.billing.MeterEvent.create(
            event_name="kore_api_call",
            payload={
                "stripe_customer_id": stripe_customer_id,
                "value": str(cost),
            },
            timestamp=int(datetime.now(timezone.utc).timestamp()),
        )
    except Exception as e:
        logger.warning(f"Stripe metering failed for {stripe_customer_id}: {e}")


def set_stripe_customer_id(customer_id: str, stripe_id: str):
    """Store Stripe customer ID for a local customer."""
    state = _load_state()
    entry = _get_or_create_customer(customer_id, state)
    entry["stripe_customer_id"] = stripe_id
    _save_state(state)


def check_and_record(tier: str, customer_id: str, service: str = "unknown") -> dict:
    """
    Record a call: enforce quota, meter to Stripe, track credits.

    Args:
        tier: free|starter|growth|business|enterprise
        customer_id: local customer identifier
        service: service name for cost calculation

    Returns:
        dict with calls_this_month, quota_remaining, cost
    """
    state = _load_state()
    entry = _get_or_create_customer(customer_id, state)

    # Update tier if changed
    entry["tier"] = tier

    # Calculate cost in credits
    cost = SERVICE_COSTS.get(service, DEFAULT_COST)

    # Quota check (monthly)
    month_key = datetime.now(timezone.utc).strftime("%Y-%m")
    month_entry = state.setdefault(f"meter:{customer_id}:{month_key}", {"calls": 0, "credits": 0})
    limit = TIERS.get(tier, 10_000)

    if limit > 0 and month_entry["calls"] >= limit:
        raise PermissionError(
            f"Monthly quota exceeded: {month_entry['calls']}/{limit} for tier '{tier}'. "
            f"Upgrade at /pricing"
        )

    # Increment counters
    month_entry["calls"] += 1
    month_entry["credits"] += cost
    entry["calls"] = entry.get("calls", 0) + 1
    entry["credits_spent"] = entry.get("credits_spent", 0) + cost

    _save_state(state)

    # Report to Stripe Meter (every call now — pay-as-you-go)
    if entry.get("stripe_customer_id"):
        _report_to_stripe_meter(entry["stripe_customer_id"], cost)

    return {
        "calls_this_month": month_entry["calls"],
        "quota_remaining": limit - month_entry["calls"],
        "credits_this_month": month_entry["credits"],
        "cost_credits": cost,
        "cost_eur": round(cost * 0.001, 4),
    }
