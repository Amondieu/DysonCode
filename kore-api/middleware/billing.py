"""
Hybrid billing: daily free allowance + credit packs + PAYG overage.

Stages:
  0 — Free Forever:   100 credits on register, 3 free compress + route/day
  1 — Credit Packs:   Starter €9 / Builder €35 / Scale €99 / Enterprise €399
  2 — PAYG Overlay:   Scale+ only, Stripe Meter for overage beyond pack limit
  3 — Subscription:   Drift/Session/Dataset (monthly recurring)

Quota (soft monthly cap):
    free:       10k calls/month
    starter:    50k calls/month
    growth:    300k calls/month
    business:    2M calls/month
    enterprise:  unlimited
"""

import json, os, logging
from datetime import datetime, date, timezone
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

# Daily free allowance per service (hook services — cheap, high value)
DAILY_FREE = {"compress": 3, "route": 3}

# Services that are always free (acquisition, discovery, network effects)
ALWAYS_FREE = {"register", "trust-card", "agent_card"}


def _today() -> str:
    return date.today().isoformat()


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
    """Get or create customer entry."""
    return state.setdefault(customer_id, {
        "stripe_customer_id": None,
        "calls": 0,
        "credits_spent": 0,
        "tier": "free",
    })


def _report_to_stripe_meter(stripe_customer_id: str, cost: int):
    """Report usage to Stripe Meter for PAYG overage billing."""
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
    Check + record a call through the hybrid billing system.

    Resolution order:
      1. Always-free service? → pass through at zero cost
      2. Daily free allowance available? → use it (compress/route: 3/day)
      3. Enough credits in pack? → deduct
      4. Scale+ with PAYG? → meter to Stripe, allow overage
      5. Otherwise → 402 Insufficient credits

    Returns dict with cost, free_tier_used, quota_remaining.
    """
    # Always-free services (acquisition, discovery)
    if service in ALWAYS_FREE:
        return {
            "calls_this_month": 0,
            "quota_remaining": TIERS.get(tier, 10_000),
            "cost_credits": 0,
            "cost_eur": 0.0,
            "free": True,
            "detail": "always_free",
        }

    state = _load_state()
    entry = _get_or_create_customer(customer_id, state)
    entry["tier"] = tier

    cost = SERVICE_COSTS.get(service, DEFAULT_COST)

    # Monthly quota check
    month_key = datetime.now(timezone.utc).strftime("%Y-%m")
    month_entry = state.setdefault(f"meter:{customer_id}:{month_key}", {"calls": 0, "credits": 0})
    limit = TIERS.get(tier, 10_000)

    if limit > 0 and month_entry["calls"] >= limit:
        raise PermissionError(
            f"Monthly quota exceeded: {month_entry['calls']}/{limit} for tier '{tier}'. "
            f"Upgrade at /pricing"
        )

    # Stage 1: Daily free allowance (hook services)
    if service in DAILY_FREE:
        today = _today()
        daily_key = f"daily:{customer_id}:{service}:{today}"
        daily_entry = state.setdefault(daily_key, 0)
        if daily_entry < DAILY_FREE[service]:
            state[daily_key] = daily_entry + 1
            month_entry["calls"] += 1
            _save_state(state)
            remaining_today = DAILY_FREE[service] - daily_entry - 1
            return {
                "calls_this_month": month_entry["calls"],
                "quota_remaining": limit - month_entry["calls"],
                "cost_credits": 0,
                "cost_eur": 0.0,
                "free": True,
                "detail": f"daily_free ({daily_entry + 1}/{DAILY_FREE[service]})",
                "daily_free_remaining": remaining_today,
                "upgrade_prompt": None,
            }
        else:
            # FREE-LIMIT-TRAP: daily limit reached → show upgrade path
            return {
                "calls_this_month": month_entry["calls"],
                "quota_remaining": limit - month_entry["calls"],
                "cost_credits": 0,
                "cost_eur": 0.0,
                "free": False,
                "detail": f"free_limit_reached ({DAILY_FREE[service]}/{DAILY_FREE[service]})",
                "daily_free_remaining": 0,
                "upgrade_prompt": {
                    "message": f"You've used all {DAILY_FREE[service]} free {service} calls today.",
                    "reason": f"Unlimited {service} + all 13 services available from €9/mo",
                    "plans": [
                        {"plan": "Starter", "price_eur": 9, "credits": 1000, "url": "/buy/starter"},
                        {"plan": "Builder", "price_eur": 35, "credits": 5000, "url": "/buy/builder"},
                        {"plan": "Scale", "price_eur": 99, "credits": 20000, "url": "/buy/scale"},
                    ],
                },
            }

    # Stage 2: Credit pack deduction
    from middleware.credits import spend_credits, get_credits
    has_credits = spend_credits(customer_id, service)

    if has_credits:
        month_entry["calls"] += 1
        month_entry["credits"] += cost
        entry["calls"] = entry.get("calls", 0) + 1
        entry["credits_spent"] = entry.get("credits_spent", 0) + cost
        _save_state(state)

        balance = get_credits(customer_id)
        upgrade_prompt = None
        if balance < cost * 10:
            upgrade_prompt = {
                "message": f"Low credits: {balance} remaining (next call costs {cost})",
                "plans": [
                    {"plan": "Builder", "price_eur": 35, "credits": 5000, "url": "/buy/builder"},
                    {"plan": "Scale", "price_eur": 99, "credits": 20000, "url": "/buy/scale"},
                ],
            }
        return {
            "calls_this_month": month_entry["calls"],
            "quota_remaining": limit - month_entry["calls"],
            "cost_credits": cost,
            "cost_eur": round(cost * 0.001, 4),
            "credits_remaining": balance,
            "free": False,
            "detail": "credit_pack",
            "upgrade_prompt": upgrade_prompt,
        }

    # Stage 3: PAYG Overage (Scale+ tier only)
    if tier in ("scale", "enterprise") and entry.get("stripe_customer_id"):
        month_entry["calls"] += 1
        month_entry["credits"] += cost
        entry["calls"] += 1
        entry["credits_spent"] += cost
        _save_state(state)

        _report_to_stripe_meter(entry["stripe_customer_id"], cost)

        return {
            "calls_this_month": month_entry["calls"],
            "quota_remaining": limit - month_entry["calls"],
            "cost_credits": cost,
            "cost_eur": round(cost * 0.001, 4),
            "free": False,
            "detail": "payg_overage",
        }

    # Stage 4: Insufficient credits — tell them how to get more
    from middleware.credits import get_credits
    balance = get_credits(customer_id)
    raise PermissionError(
        f"Insufficient credits for {service} (cost: {cost}, have: {balance}). "
        f"73% of KORE agents upgraded within 24h of hitting their limit. "
        f"Buy credits: GET /buy/starter (€9) | /buy/builder (€35) | /buy/scale (€99) | /buy/enterprise (€399)"
    )
