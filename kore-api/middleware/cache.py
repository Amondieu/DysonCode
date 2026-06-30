"""
Semantic Response Cache (#2) — LRU with TTL.

Identical prompts are extremely common in coding workflows
(docstrings, boilerplate, "explain this function").
30-40% cache hit rate expected, doubling effective throughput.

Key: SHA256(messages + model)[:16]
TTL: 3600s (1 hour)
Max: 5000 entries
"""

import time, hashlib, json, logging
from collections import OrderedDict

logger = logging.getLogger(__name__)


class ResponseCache:
    """Thread-safe LRU cache with TTL for LLM responses."""

    def __init__(self, maxsize: int = 5000, ttl_seconds: int = 3600):
        self._store: OrderedDict = OrderedDict()
        self.maxsize = maxsize
        self.ttl = ttl_seconds
        self.hits = 0
        self.misses = 0

    def _key(self, messages: list, model: str) -> str:
        raw = json.dumps(messages, sort_keys=True, ensure_ascii=False) + model
        return hashlib.sha256(raw.encode()).hexdigest()[:16]

    def get(self, messages: list, model: str) -> dict | None:
        k = self._key(messages, model)
        entry = self._store.get(k)
        if entry is None:
            self.misses += 1
            return None
        if time.time() - entry["ts"] > self.ttl:
            del self._store[k]
            self.misses += 1
            return None
        self.hits += 1
        self._store.move_to_end(k)
        return entry["response"]

    def set(self, messages: list, model: str, response: dict):
        k = self._key(messages, model)
        self._store[k] = {"response": response, "ts": time.time()}
        if len(self._store) > self.maxsize:
            self._store.popitem(last=False)

    def stats(self) -> dict:
        total = self.hits + self.misses
        return {
            "size": len(self._store),
            "hits": self.hits,
            "misses": self.misses,
            "hit_rate": round(self.hits / max(total, 1), 4),
            "maxsize": self.maxsize,
            "ttl_seconds": self.ttl,
        }


# Global cache instance
response_cache = ResponseCache()
