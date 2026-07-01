#!/usr/bin/env python3
"""
webhook_router_v2.py — Subscription lifecycle event handlers for KORE v2.

Integration
-----------
FastAPI:
    from webhook_router_v2 import webhook_router
    app.include_router(webhook_router, prefix="/webhooks/stripe")

Flask/WSGI:
    from webhook_router_v2 import handle_webhook
    handle_webhook(body, sig_header, store)

Requires a WalletStore implementation (Redis / Postgres / any KV).
Protocol interface defined below.
"""

from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Optional, Protocol

logger = logging.getLogger(__name__)

STRIPE_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET_V2", "")
STRIPE_KEY = os.environ.get("STRIPE_SECRET_KEY", "")

# ── WalletStore Protocol ──────────────────────────────────────────────────────


class WalletStore(Protocol):
    """Interface for persisting subscription pool state.

    Implement this against your DB (Redis, Postgres, etc.).
    """

    async def get_pool(self, tenant_id: str, tier: str) -> int:
        """Return remaining credits in the subscription pool for this tier."""
        ...

    async def set_pool(self, tenant_id: str, tier: str, credits: int) -> None:
        """Set the subscription pool credit balance for this tier."""
        ...

    async def grant_pool(self, tenant_id: str, tier: str, credits: int) -> None:
        """Grant a pool of credits to a tenant (creates or overwrites)."""
        ...

    async def revoke_pool(self, tenant_id: str, tier: str) -> None:
        """Remove a subscription pool for a tenant."""
        ...

    async def revoke_all_pools(self, tenant_id: str) -> None:
        """Remove all subscription pools for a tenant (fallback to PAYG)."""
        ...

    async def set_grace_period(self, tenant_id: str, expires_at: str) -> None:
        """Set a grace period timestamp for payment failure."""
        ...

    async def get_grace_period(self, tenant_id: str) -> Optional[str]:
        """Return grace period expiry timestamp, or None."""
        ...

    async def get_tenant_by_stripe(self, stripe_customer_id: str) -> Optional[str]:
        """Return tenant_id for a Stripe customer ID."""
        ...

    async def record_subscription(self, tenant_id: str, tier: str,
                                  subscription_id: str, stripe_customer_id: str) -> None:
        """Record a subscription mapping in the store."""
        ...

    async def get_active_subscription(self, tenant_id: str) -> Optional[dict]:
        """Return active subscription info for a tenant."""
        ...


# ── In-memory WalletStore (for testing / single-instance) ─────────────────────


@dataclass
class InMemoryWalletStore:
    """Simple in-memory implementation for testing. Replace with Redis/DB in prod."""

    pools: dict[str, dict[str, int]] = field(default_factory=dict)  # tenant -> {tier: credits}
    tenants_by_stripe: dict[str, str] = field(default_factory=dict)  # stripe_cust_id -> tenant_id
    subscriptions: dict[str, dict] = field(default_factory=dict)     # tenant_id -> sub info
    grace_periods: dict[str, str] = field(default_factory=dict)      # tenant_id -> expiry_iso

    async def get_pool(self, tenant_id: str, tier: str) -> int:
        return self.pools.get(tenant_id, {}).get(tier, 0)

    async def set_pool(self, tenant_id: str, tier: str, credits: int) -> None:
        self.pools.setdefault(tenant_id, {})[tier] = credits

    async def grant_pool(self, tenant_id: str, tier: str, credits: int) -> None:
        self.pools.setdefault(tenant_id, {})[tier] = credits
        logger.info(f"Pool granted: tenant={tenant_id} tier={tier} credits={credits}")

    async def revoke_pool(self, tenant_id: str, tier: str) -> None:
        pool = self.pools.get(tenant_id, {})
        pool.pop(tier, None)
        logger.info(f"Pool revoked: tenant={tenant_id} tier={tier}")

    async def revoke_all_pools(self, tenant_id: str) -> None:
        self.pools.pop(tenant_id, None)
        logger.info(f"All pools revoked: tenant={tenant_id} → PAYG fallback")

    async def set_grace_period(self, tenant_id: str, expires_at: str) -> None:
        self.grace_periods[tenant_id] = expires_at

    async def get_grace_period(self, tenant_id: str) -> Optional[str]:
        return self.grace_periods.get(tenant_id)

    async def get_tenant_by_stripe(self, stripe_customer_id: str) -> Optional[str]:
        return self.tenants_by_stripe.get(stripe_customer_id)

    async def record_subscription(self, tenant_id: str, tier: str,
                                  subscription_id: str, stripe_customer_id: str) -> None:
        self.subscriptions[tenant_id] = {
            "tier": tier,
            "subscription_id": subscription_id,
            "stripe_customer_id": stripe_customer_id,
            "active": True,
        }
        self.tenants_by_stripe[stripe_customer_id] = tenant_id
        logger.info(f"Subscription recorded: tenant={tenant_id} tier={tier} sub={subscription_id}")

    async def get_active_subscription(self, tenant_id: str) -> Optional[dict]:
        return self.subscriptions.get(tenant_id)


# ── Tier → credits lookup ────────────────────────────────────────────────────

TIER_CREDITS = {
    "dev": 1_200,
    "pro": 6_000,
    "memory_bundle": 1_200,
}


def _tenant_from_event(evt: dict) -> Optional[str]:
    """Extract tenant_id from Stripe event metadata or customer mapping."""
    obj = evt.get("data", {}).get("object", {})
    metadata = obj.get("metadata", {})
    tenant = metadata.get("tenant_id")
    if tenant:
        return tenant

    # Fallback: check client_reference_id (checkout sessions)
    client_ref = obj.get("client_reference_id")
    if client_ref:
        return client_ref

    return None


def _tier_from_price(price_id: str) -> Optional[str]:
    """Map Stripe price_id to tier key by checking metadata or known IDs."""
    try:
        import stripe
        stripe.api_key = STRIPE_KEY
        price = stripe.Price.retrieve(price_id)
        meta_tier = price.get("metadata", {}).get("tier")
        if meta_tier:
            return meta_tier
    except Exception:
        pass

    # Fallback: match known keys from config
    for tier_key, credits in TIER_CREDITS.items():
        if tier_key in price_id:
            return tier_key
    return None


# ── Event Handlers ────────────────────────────────────────────────────────────


async def _handle_subscription_created(evt: dict, store: WalletStore) -> dict:
    """
    customer.subscription.created
    Action: grant_pool(tenant, tier, credits)
    """
    obj = evt["data"]["object"]
    tenant = _tenant_from_event(evt)
    if not tenant:
        customer_id = obj.get("customer")
        if customer_id:
            tenant = await store.get_tenant_by_stripe(customer_id)
    if not tenant:
        logger.warning("No tenant found for subscription.created event")
        return {"status": "skipped", "reason": "no_tenant"}

    tier = _tier_from_price(obj.get("items", {}).get("data", [{}])[0].get("price", ""))
    if not tier or tier not in TIER_CREDITS:
        logger.warning(f"Unknown tier from subscription: {tier}")
        return {"status": "skipped", "reason": f"unknown_tier:{tier}"}

    credits = TIER_CREDITS[tier]
    await store.grant_pool(tenant, tier, credits)

    sub_id = obj.get("id", "unknown")
    customer_id = obj.get("customer", "unknown")
    await store.record_subscription(tenant, tier, sub_id, customer_id)

    logger.info(f"Subscription created: tenant={tenant} tier={tier} credits={credits}")
    return {"status": "ok", "tenant": tenant, "tier": tier, "credits": credits}


async def _handle_subscription_updated(evt: dict, store: WalletStore) -> dict:
    """
    customer.subscription.updated
    Action: Revoke old pool → grant new tier
    """
    obj = evt["data"]["object"]
    previous = evt.get("data", {}).get("previous_attributes", {})

    tenant = _tenant_from_event(evt)
    if not tenant:
        customer_id = obj.get("customer")
        if customer_id:
            tenant = await store.get_tenant_by_stripe(customer_id)
    if not tenant:
        logger.warning("No tenant for subscription.updated")
        return {"status": "skipped", "reason": "no_tenant"}

    # Check if there's a previous subscription state
    prev_sub = evt.get("data", {}).get("previous_attributes", {})

    # Revoke old pools if tier changed
    items = obj.get("items", {}).get("data", [])
    if items:
        current_price = items[0].get("price", {}).get("id", "") if isinstance(items[0].get("price"), dict) else items[0].get("price", "")
        new_tier = _tier_from_price(current_price)
        if new_tier and new_tier in TIER_CREDITS:
            # Revoke all existing pools first
            await store.revoke_all_pools(tenant)
            # Grant new tier
            credits = TIER_CREDITS[new_tier]
            await store.grant_pool(tenant, new_tier, credits)
            logger.info(f"Subscription updated: tenant={tenant} tier={new_tier} credits={credits}")
            return {"status": "ok", "tenant": tenant, "tier": new_tier, "credits": credits}

    logger.info(f"Subscription updated (no tier change): tenant={tenant}")
    return {"status": "ok", "tenant": tenant, "detail": "no_change"}


async def _handle_subscription_deleted(evt: dict, store: WalletStore) -> dict:
    """
    customer.subscription.deleted
    Action: Revoke all pools → PAYG fallback
    """
    obj = evt["data"]["object"]
    tenant = _tenant_from_event(evt)
    if not tenant:
        customer_id = obj.get("customer")
        if customer_id:
            tenant = await store.get_tenant_by_stripe(customer_id)
    if not tenant:
        return {"status": "skipped", "reason": "no_tenant"}

    await store.revoke_all_pools(tenant)
    logger.info(f"Subscription deleted: tenant={tenant} → PAYG fallback")
    return {"status": "ok", "tenant": tenant, "action": "payg_fallback"}


async def _handle_invoice_payment_succeeded(evt: dict, store: WalletStore) -> dict:
    """
    invoice.payment_succeeded
    Action: renew_pool monthly reset
    """
    obj = evt["data"]["object"]
    subscription_id = obj.get("subscription")
    customer_id = obj.get("customer")

    if not subscription_id:
        return {"status": "skipped", "reason": "no_subscription"}

    # Find tenant from metadata or customer mapping
    tenant = _tenant_from_event(evt)
    if not tenant and customer_id:
        tenant = await store.get_tenant_by_stripe(customer_id)

    # Try to find from subscription records
    if not tenant:
        for tid, sub in (await _get_all_subs(store)).items():
            if sub.get("subscription_id") == subscription_id:
                tenant = tid
                break

    if not tenant:
        return {"status": "skipped", "reason": "no_tenant"}

    # Renew pool: find current tier and re-grant
    sub_info = await store.get_active_subscription(tenant)
    if not sub_info:
        logger.warning(f"No active subscription record for tenant={tenant}")
        return {"status": "skipped", "reason": "no_subscription_record"}

    tier = sub_info.get("tier", "")
    if tier in TIER_CREDITS:
        credits = TIER_CREDITS[tier]
        await store.grant_pool(tenant, tier, credits)
        logger.info(f"Pool renewed: tenant={tenant} tier={tier} credits={credits}")

    # Clear any grace period
    await store.set_grace_period(tenant, "")

    return {"status": "ok", "tenant": tenant, "tier": tier}


async def _handle_invoice_payment_failed(evt: dict, store: WalletStore) -> dict:
    """
    invoice.payment_failed
    Action: 3-day grace period; no immediate pool revoke
    """
    obj = evt["data"]["object"]
    customer_id = obj.get("customer")
    tenant = _tenant_from_event(evt)
    if not tenant and customer_id:
        tenant = await store.get_tenant_by_stripe(customer_id)
    if not tenant:
        return {"status": "skipped", "reason": "no_tenant"}

    # Set 3-day grace period
    expires = (datetime.now(timezone.utc) + timedelta(days=3)).isoformat()
    await store.set_grace_period(tenant, expires)
    logger.warning(f"Payment failed: tenant={tenant} grace_period={expires}")
    return {"status": "ok", "tenant": tenant, "grace_period": expires}


async def _handle_checkout_session_completed(evt: dict, store: WalletStore) -> dict:
    """
    checkout.session.completed
    Action: Immediate UI unlock signal, map tenant to Stripe customer
    """
    obj = evt["data"]["object"]
    client_ref = obj.get("client_reference_id", "")
    customer_id = obj.get("customer", "")
    metadata = obj.get("metadata", {})

    tenant = metadata.get("tenant_id", client_ref)
    if not tenant:
        logger.warning("No tenant in checkout.session.completed")
        return {"status": "skipped", "reason": "no_tenant"}

    # Map tenant to Stripe customer for future lookups
    if customer_id and tenant:
        # Store mapping (handled within record_subscription-like logic)
        try:
            # We'll just log the mapping; subscription.created will handle the rest
            logger.info(f"Checkout completed: tenant={tenant} stripe_customer={customer_id}")
        except Exception as e:
            logger.warning(f"Could not store checkout mapping: {e}")

    return {"status": "ok", "tenant": tenant, "stripe_customer": customer_id}


async def _get_all_subs(store: WalletStore) -> dict:
    """Helper to get all subscriptions from store (in-memory fallback)."""
    if hasattr(store, "subscriptions"):
        return store.subscriptions
    return {}


# ── Event Router ──────────────────────────────────────────────────────────────

EVENT_HANDLERS = {
    "customer.subscription.created": _handle_subscription_created,
    "customer.subscription.updated": _handle_subscription_updated,
    "customer.subscription.deleted": _handle_subscription_deleted,
    "invoice.payment_succeeded": _handle_invoice_payment_succeeded,
    "invoice.payment_failed": _handle_invoice_payment_failed,
    "checkout.session.completed": _handle_checkout_session_completed,
}


async def route_event(payload: dict, store: WalletStore) -> dict:
    """
    Route a Stripe event to the appropriate handler.

    Args:
        payload: Parsed Stripe event dict (from webhook body)
        store: WalletStore implementation

    Returns:
        Handler result dict
    """
    event_type = payload.get("type", "")
    handler = EVENT_HANDLERS.get(event_type)

    if not handler:
        logger.debug(f"No handler for event type: {event_type}")
        return {"status": "ignored", "event_type": event_type}

    try:
        result = await handler(payload, store)
        return result
    except Exception as e:
        logger.error(f"Handler failed for {event_type}: {e}")
        return {"status": "error", "event_type": event_type, "error": str(e)}


# ── FastAPI Router (optional) ─────────────────────────────────────────────────

try:
    from fastapi import APIRouter, Request, HTTPException, Header
    import stripe as _stripe_lib

    webhook_router = APIRouter()

    STORE: Optional[WalletStore] = None


    def configure_store(store: WalletStore):
        """Call once at app startup to set the WalletStore instance."""
        global STORE
        STORE = store


    @webhook_router.post("")
    async def stripe_webhook_v2(
        request: Request,
        stripe_signature: str = Header(None),
    ):
        raw_body = await request.body()
        if not STRIPE_SECRET:
            raise HTTPException(status_code=500, detail="Webhook secret not configured")

        try:
            event = _stripe_lib.Webhook.construct_event(
                payload=raw_body,
                sig_header=stripe_signature or "",
                secret=STRIPE_SECRET,
            )
        except _stripe_lib.error.SignatureVerificationError:
            raise HTTPException(status_code=400, detail="Invalid signature")

        if STORE is None:
            raise HTTPException(status_code=500, detail="WalletStore not configured")

        result = await route_event(event.to_dict(), STORE)
        return {"received": True, "result": result}

except ImportError:
    webhook_router = None
    configure_store = lambda store: None  # noqa: E731


# ── WSGI handler (Flask / plain WSGI) ────────────────────────────────────────

async def handle_webhook(body: bytes, sig_header: str, store: WalletStore) -> dict:
    """
    Handle a Stripe webhook directly (Flask/WSGI compatibility).

    Args:
        body: Raw request body bytes
        sig_header: Stripe-Signature header value
        store: WalletStore implementation

    Returns:
        Handler result dict
    """
    if not STRIPE_SECRET:
        return {"status": "error", "detail": "Webhook secret not configured"}

    try:
        import stripe as _stripe_lib
        event = _stripe_lib.Webhook.construct_event(
            payload=body,
            sig_header=sig_header,
            secret=STRIPE_SECRET,
        )
    except Exception as e:
        logger.error(f"Webhook verification failed: {e}")
        return {"status": "error", "detail": str(e)}

    result = await route_event(event.to_dict(), store)
    return {"received": True, "result": result}
