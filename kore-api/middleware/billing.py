"""
Local call-counting metering with optional Stripe integration.

Quota enforcement:
    free:       10k calls/month
    starter:    50k calls/month
    growth:    300k calls/month
    business:    2M calls/month
    enterprise:  unlimited

Stripe Metering only fires when STRIPE_SECRET_KEY is set.
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


def check_and_record(tier: str, customer_id: str) -> dict:
    state = _load_state()
    month_key = datetime.now(timezone.utc).strftime("%Y-%m")
    customer_key = f"{customer_id}:{month_key}"

    entry = state.get(customer_key, {"calls": 0})
    limit = TIERS.get(tier, 10_000)

    if limit > 0 and entry["calls"] >= limit:
        raise PermissionError(f"Quota exceeded: {entry['calls']}/{limit} for tier '{tier}'")

    entry["calls"] += 1
    state[customer_key] = entry
    _save_state(state)

    # Stripe metering (optional)
    if STRIPE_KEY and entry["calls"] % 100 == 0:
        try:
            import stripe
            stripe.api_key = STRIPE_KEY
            stripe.billing.MeterEvent.create(
                event_name="kore_api_calls",
                payload={"stripe_customer_id": customer_id, "value": "100"},
            )
        except Exception as e:
            logger.warning(f"Stripe metering failed: {e}")

    return {"calls_this_month": entry["calls"], "quota_remaining": limit - entry["calls"]}
