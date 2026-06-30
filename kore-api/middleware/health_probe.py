"""
Background Health Probing (#5) — Proactive Circuit Breaker.

Every 60s, sends a 1-token probe to each provider.
Circuit Breaker state updates without user-facing latency.

If a provider is down, users never see the failure —
the router already knows and skips it.
"""

import asyncio, logging, time
from typing import Callable

logger = logging.getLogger(__name__)


class HealthProbe:
    """Background health monitor for provider endpoints."""

    def __init__(self, providers: dict, breaker_check: Callable, probe_fn: Callable):
        self.providers = providers
        self.breaker_check = breaker_check
        self.probe_fn = probe_fn
        self._task = None

    async def _probe_loop(self, interval: float = 60.0):
        while True:
            await asyncio.sleep(interval)
            for pid, config in self.providers.items():
                breaker = self.breaker_check(pid)
                if breaker and breaker["state"] == "half_open":
                    continue  # Already known — skip
                try:
                    t0 = time.time()
                    await self.probe_fn(pid, [{"role": "user", "content": "ping"}], max_tokens=1)
                    latency = (time.time() - t0) * 1000
                    logger.debug(f"Health probe OK: {pid} ({latency:.0f}ms)")
                except Exception as e:
                    logger.warning(f"Health probe FAIL: {pid} — {e}")
                    # Circuit breaker updates internally

    def start(self, interval: float = 60.0):
        """Start the background probe loop."""
        self._task = asyncio.create_task(self._probe_loop(interval))
        logger.info(f"Health probing started (interval={interval}s)")

    def stop(self):
        """Stop the probe loop."""
        if self._task:
            self._task.cancel()


# Simple in-memory circuit breaker state
breaker_states: dict[str, dict] = {}


def get_breaker(provider_id: str) -> dict:
    """Get or create circuit breaker state for a provider."""
    if provider_id not in breaker_states:
        breaker_states[provider_id] = {
            "state": "closed",
            "failures": 0,
            "last_failure": 0,
            "recovery_time": 30,
        }
    return breaker_states[provider_id]


def record_success(provider_id: str):
    b = get_breaker(provider_id)
    b["failures"] = 0
    b["state"] = "closed"


def record_failure(provider_id: str):
    b = get_breaker(provider_id)
    b["failures"] += 1
    b["last_failure"] = time.time()
    if b["failures"] >= 3:
        b["state"] = "open"
        logger.warning(f"Circuit OPEN: {provider_id} ({b['failures']} failures)")


def can_attempt(provider_id: str) -> bool:
    b = get_breaker(provider_id)
    if b["state"] == "closed":
        return True
    if b["state"] == "open":
        if time.time() - b["last_failure"] > b["recovery_time"]:
            b["state"] = "half_open"
            return True
        return False
    return True  # half_open — allow probe
