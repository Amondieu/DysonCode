"""
billing_v2.py — KORE Credit Billing · v2
=========================================

Changes vs v1
--------------
Route           4 cr  → 2 cr   (deterministic, no LLM; undercuts RAG-as-a-service by 41%)
sandbox_exec   20 cr  → 10 cr  (managed sandbox premium; removes the single biggest adoption barrier)
score          40 cr  → 20 cr  (local inference margin >>20%; halves adoption threshold)
verify         72 cr  → 36 cr  (unique ΦΩΡΓΕ adversary organ; 2× proxy rate = fair premium)

Subscription tiers (new in v2)
-------------------------------
Dev            €9/mo   → 1,200 cr/mo   (~600 avg calls at 2cr; ~33 sandbox runs/mo)
Pro            €35/mo  → 6,000 cr/mo   (~3,000 avg calls; production agent stacks)
Memory Bundle  €9/mo   → 1,200 cr/mo   scope-locked to memory_* endpoints only

Resolution order (per call)
----------------------------
1. Subscription pool (monthly reset; memory_bundle locked to memory_* only)
2. Prepaid credit balance
3. Pay-as-you-go (€0.001/cr billed immediately to Stripe)
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Optional

# ── Credit weights ────────────────────────────────────────────────────────────

CREDIT_WEIGHTS: dict[str, int] = {
    # ── unchanged from v1 ──
    "memory_recall":      1,
    "normalize":          1,
    "embed":              1,   # v2: was 2 (BGE-M3 self-hosted = $0 cost)
    "compress":           2,
    "memory_write":       2,   # v2: was 3 (undercut openapi.com ingest by 33%)
    "guard":              3,   # v2: was 4 (25% below RAG+classify proxy)
    "diff":               4,   # v2: was 5 (41% below 2× RAG proxy)
    "split":              8,   # v2: was 10 (43% below RAG+answer proxy)
    "provenance_certify": 12,  # v2: was 15 (compliance premium preserved; 20% below proxy)
    # ── v2 major repricing ──
    "route":              2,   # v2: was 4  ← deterministic; undercuts market by 41%
    "sandbox_exec":       10,  # v2: was 20 ← biggest adoption unlock
    "score":              20,  # v2: was 40 ← local inference; halves barrier
    "verify":             36,  # v2: was 72 ← unique; 2× proxy = fair premium
}

# ── Subscription tiers ────────────────────────────────────────────────────────


class TierID(str, Enum):
    DEV = "dev"
    PRO = "pro"
    MEMORY = "memory_bundle"


@dataclass
class Tier:
    id: TierID
    name: str
    monthly_eur: float
    monthly_credits: int
    # If non-empty, credits are scope-locked to these endpoint prefixes
    endpoint_scope: list[str] = field(default_factory=list)
    stripe_price_id: Optional[str] = None   # filled after Stripe product creation


TIERS: dict[TierID, Tier] = {
    TierID.DEV: Tier(
        id=TierID.DEV,
        name="Dev",
        monthly_eur=9.00,
        monthly_credits=1_200,
        endpoint_scope=[],  # unrestricted
    ),
    TierID.PRO: Tier(
        id=TierID.PRO,
        name="Pro",
        monthly_eur=35.00,
        monthly_credits=6_000,
        endpoint_scope=[],
    ),
    TierID.MEMORY: Tier(
        id=TierID.MEMORY,
        name="Memory Bundle",
        monthly_eur=9.00,
        monthly_credits=1_200,
        endpoint_scope=["memory_"],  # locked to memory_recall, memory_write
    ),
}

# ── Resolution order ──────────────────────────────────────────────────────────

OVERAGE_EUR_PER_CREDIT = 0.001   # pay-as-you-go rate (unchanged)


@dataclass
class Wallet:
    """Runtime state per tenant. Persisted externally (Redis / DB)."""
    tenant_id: str
    subscription_pool: dict[TierID, int] = field(default_factory=dict)
    prepaid_balance: int = 0


class InsufficientCreditsError(Exception):
    pass


def deduct(wallet: Wallet, endpoint: str, dry_run: bool = False) -> dict:
    """
    Deduct credits for one API call.

    Resolution order:
    1. Subscription pool (scope-checked for memory_bundle)
    2. Prepaid balance
    3. PAYG — returns payg_eur > 0 to trigger Stripe metered billing

    Returns a dict with:
        source            : "subscription" | "prepaid" | "payg"
        credits_used      : int
        payg_eur          : float (0 unless PAYG)
        pool_remaining    : dict[TierID, int]
        prepaid_remaining : int
    """
    weight = CREDIT_WEIGHTS.get(endpoint)
    if weight is None:
        raise ValueError(f"Unknown endpoint: {endpoint!r}")

    def _tier_eligible(tier_id: TierID) -> bool:
        scope = TIERS[tier_id].endpoint_scope
        return not scope or any(endpoint.startswith(pfx) for pfx in scope)

    if dry_run:
        # Simulate only
        for tier_id, pool in wallet.subscription_pool.items():
            if pool >= weight and _tier_eligible(tier_id):
                return {"source": "subscription", "credits_used": weight,
                        "payg_eur": 0.0, "pool_remaining": dict(wallet.subscription_pool),
                        "prepaid_remaining": wallet.prepaid_balance}
        if wallet.prepaid_balance >= weight:
            return {"source": "prepaid", "credits_used": weight, "payg_eur": 0.0,
                    "pool_remaining": dict(wallet.subscription_pool),
                    "prepaid_remaining": wallet.prepaid_balance}
        return {"source": "payg", "credits_used": weight,
                "payg_eur": round(weight * OVERAGE_EUR_PER_CREDIT, 6),
                "pool_remaining": dict(wallet.subscription_pool),
                "prepaid_remaining": wallet.prepaid_balance}

    # 1. Subscription pool
    for tier_id, pool in list(wallet.subscription_pool.items()):
        if pool >= weight and _tier_eligible(tier_id):
            wallet.subscription_pool[tier_id] -= weight
            return {"source": "subscription", "credits_used": weight,
                    "payg_eur": 0.0, "pool_remaining": dict(wallet.subscription_pool),
                    "prepaid_remaining": wallet.prepaid_balance}

    # 2. Prepaid balance
    if wallet.prepaid_balance >= weight:
        wallet.prepaid_balance -= weight
        return {"source": "prepaid", "credits_used": weight, "payg_eur": 0.0,
                "pool_remaining": dict(wallet.subscription_pool),
                "prepaid_remaining": wallet.prepaid_balance}

    # 3. PAYG (caller must charge Stripe)
    payg = round(weight * OVERAGE_EUR_PER_CREDIT, 6)
    return {"source": "payg", "credits_used": weight, "payg_eur": payg,
            "pool_remaining": dict(wallet.subscription_pool),
            "prepaid_remaining": wallet.prepaid_balance}


# ── Convenience helpers ───────────────────────────────────────────────────────

def credit_cost(endpoint: str) -> int:
    """Return the credit weight for an endpoint."""
    return CREDIT_WEIGHTS[endpoint]


def eur_cost(endpoint: str) -> float:
    """Return the PAYG EUR cost for one call to endpoint."""
    return round(CREDIT_WEIGHTS[endpoint] * OVERAGE_EUR_PER_CREDIT, 6)
