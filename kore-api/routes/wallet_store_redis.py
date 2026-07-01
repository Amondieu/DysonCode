"""
kore-api/routes/wallet_store_redis.py — Redis WalletStore for billing v2
=========================================================================
Implements the WalletStore Protocol from webhook_router_v2.py using Redis.

Requirements:
    redis>=5.0.0
    hiredis>=2.3.2  (optional, 3× faster parsing)

Keys:
    kore:wallet:{tenant_id}:pool:{tier}      → int  (subscription credits remaining)
    kore:wallet:{tenant_id}:prepaid          → int  (prepaid balance in credits)
    kore:wallet:{tenant_id}:grace_expires    → int  (unix timestamp, grace period end)
    kore:wallet:{tenant_id}:usage:{YYYY-MM}  → hash (tool_name → credits_used)
    kore:wallet:{tenant_id}:stripe_sub       → str  (Stripe subscription ID)
"""

from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Optional

import redis.asyncio as aioredis


class RedisWalletStore:
    """
    Async Redis-backed WalletStore.
    Satisfies the WalletStore Protocol from webhook_router_v2.py.

    Usage:
        store = RedisWalletStore.from_url("redis://localhost:6379/0")
        await store.connect()
    """

    def __init__(self, redis_url: str = "redis://localhost:6379/0"):
        self._url    = redis_url
        self._redis: Optional[aioredis.Redis] = None

    @classmethod
    def from_url(cls, url: str) -> "RedisWalletStore":
        return cls(redis_url=url)

    async def connect(self) -> None:
        self._redis = aioredis.from_url(
            self._url,
            encoding="utf-8",
            decode_responses=True,
            socket_connect_timeout=2,
            socket_timeout=1,
        )
        await self._redis.ping()

    async def close(self) -> None:
        if self._redis:
            await self._redis.aclose()

    # ── Pool operations ────────────────────────────────────────────────────────

    async def add_subscription_credits(
        self, tenant_id: str, tier: str, credits: int, stripe_sub_id: str
    ) -> None:
        """Called by webhook_router_v2 on customer.subscription.created/updated."""
        pipe = self._redis.pipeline()
        pipe.set(f"kore:wallet:{tenant_id}:pool:{tier}", credits)
        pipe.set(f"kore:wallet:{tenant_id}:stripe_sub", stripe_sub_id)
        pipe.delete(f"kore:wallet:{tenant_id}:grace_expires")
        await pipe.execute()

    async def reset_subscription_pool(
        self, tenant_id: str, tier: str, credits: int
    ) -> None:
        """Called on invoice.payment_succeeded for monthly renewal."""
        await self._redis.set(f"kore:wallet:{tenant_id}:pool:{tier}", credits)

    async def set_grace_period(self, tenant_id: str, expires_at: int) -> None:
        """Called by payment failure handler. expires_at = unix timestamp."""
        await self._redis.set(f"kore:wallet:{tenant_id}:grace_expires", expires_at)

    async def clear_subscription(self, tenant_id: str, tier: str) -> None:
        """Called on subscription cancelled after grace period."""
        pipe = self._redis.pipeline()
        pipe.delete(f"kore:wallet:{tenant_id}:pool:{tier}")
        pipe.delete(f"kore:wallet:{tenant_id}:grace_expires")
        pipe.delete(f"kore:wallet:{tenant_id}:stripe_sub")
        await pipe.execute()

    # ── Balance read + deduct (hot path — must be <5ms) ───────────────────────

    async def get_balance(self, tenant_id: str, tier: str = "pro") -> dict:
        """
        Returns current credit state. Called on every tool invocation.
        Uses a single Redis pipeline — typically 0.5–1ms on local network.
        """
        pipe = self._redis.pipeline()
        pipe.get(f"kore:wallet:{tenant_id}:pool:{tier}")
        pipe.get(f"kore:wallet:{tenant_id}:prepaid")
        pipe.get(f"kore:wallet:{tenant_id}:grace_expires")
        pool_raw, prepaid_raw, grace_raw = await pipe.execute()

        pool    = int(pool_raw)    if pool_raw    else 0
        prepaid = int(prepaid_raw) if prepaid_raw else 0
        grace   = int(grace_raw)   if grace_raw   else 0

        now = int(time.time())
        in_grace = grace > 0 and now < grace

        return {
            "pool":     pool,
            "prepaid":  prepaid,
            "total":    pool + prepaid,
            "in_grace": in_grace,
            "grace_expires_at": grace or None,
        }

    async def deduct(
        self, tenant_id: str, tool_name: str, credits: int, tier: str = "pro"
    ) -> dict:
        """
        Atomic deduct: subscription pool first, then prepaid, then PAYG signal.
        Uses Lua script for atomicity — no race conditions in concurrent agents.
        Returns the resolution path taken.
        """
        lua = """
        local pool_key    = KEYS[1]
        local prepaid_key = KEYS[2]
        local cost        = tonumber(ARGV[1])
        local pool = tonumber(redis.call('GET', pool_key) or '0')
        if pool >= cost then
            redis.call('DECRBY', pool_key, cost)
            return {'pool', pool - cost, 0}
        end
        local from_pool = pool
        local remainder = cost - from_pool
        redis.call('SET', pool_key, 0)
        local prepaid = tonumber(redis.call('GET', prepaid_key) or '0')
        if prepaid >= remainder then
            redis.call('DECRBY', prepaid_key, remainder)
            return {'pool+prepaid', 0, prepaid - remainder}
        end
        local from_prepaid = prepaid
        redis.call('SET', prepaid_key, 0)
        return {'payg', 0, 0, cost - from_pool - from_prepaid}
        """
        result = await self._redis.eval(
            lua,
            2,
            f"kore:wallet:{tenant_id}:pool:{tier}",
            f"kore:wallet:{tenant_id}:prepaid",
            str(credits),
        )
        # Track usage
        month = datetime.now(timezone.utc).strftime("%Y-%m")
        await self._redis.hincrby(
            f"kore:wallet:{tenant_id}:usage:{month}", tool_name, credits
        )
        source, pool_rem, prepaid_rem = result[0], int(result[1]), int(result[2])
        payg_credits = int(result[3]) if len(result) > 3 else 0
        return {
            "source":       source,
            "pool_remaining":    pool_rem,
            "prepaid_remaining": prepaid_rem,
            "payg_credits":      payg_credits,
            "payg_eur":          payg_credits * 0.001,
        }

    # ── Usage analytics ────────────────────────────────────────────────────────

    async def get_usage(self, tenant_id: str, month: Optional[str] = None) -> dict:
        """Returns per-tool credit usage for a given month (default: current)."""
        if not month:
            month = datetime.now(timezone.utc).strftime("%Y-%m")
        usage = await self._redis.hgetall(f"kore:wallet:{tenant_id}:usage:{month}")
        return {k: int(v) for k, v in usage.items()}

    async def get_summary(self, tenant_id: str) -> dict:
        """
        Free wallet_summary endpoint backing.
        Returns full state + 80% usage warning + upgrade suggestion.
        """
        tiers = ["dev", "pro", "memory_bundle"]
        pipe  = self._redis.pipeline()
        for tier in tiers:
            pipe.get(f"kore:wallet:{tenant_id}:pool:{tier}")
        pipe.get(f"kore:wallet:{tenant_id}:prepaid")
        pipe.get(f"kore:wallet:{tenant_id}:stripe_sub")
        raw = await pipe.execute()

        pools   = {t: int(v) if v else 0 for t, v in zip(tiers, raw[:-2])}
        prepaid = int(raw[-2]) if raw[-2] else 0
        sub_id  = raw[-1]

        month_usage = await self.get_usage(tenant_id)
        total_used  = sum(month_usage.values())

        TIER_CREDITS = {"dev": 1200, "pro": 6000, "memory_bundle": 1200}
        suggestions = []
        for tier, alloc in TIER_CREDITS.items():
            if pools.get(tier, 0) < alloc * 0.2 and alloc > 0:
                suggestions.append(f"Pool '{tier}' is below 20% — consider upgrading or adding prepaid balance")

        return {
            "tenant_id":          tenant_id,
            "subscription_pools": pools,
            "prepaid_balance":    prepaid,
            "stripe_sub_id":      sub_id,
            "usage_this_month":   month_usage,
            "total_credits_used": total_used,
            "suggestions":        suggestions,
        }
