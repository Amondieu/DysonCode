"""jcode → LiteLLM Bridge — Python LiteLLM client for the jcode pipeline.

Enables Muster A (pre-gate): jcode validates the prompt BEFORE the LLM call,
then checks fixpoint on the model response. Harvests the existing LiteLLMClient
pattern from memory/memory_keeper.py (Dyson Law 10).

Supports both sync (orchestrator-friendly) and async (memory-keeper-style) calls.
Env vars match agent-executor.ts for zero-config bridge:
  LITELLM_BASE_URL  → proxy URL (default: http://127.0.0.1:4000/v1)
  LITELLM_API_KEY   → API key     (default: grey-os-local)
  KORE_AGENT_MODEL  → model name  (default: flash-k2)
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class LiteLLMBridge:
    """Synchronous LiteLLM client for the jcode pipeline.

    Mirrors the async LiteLLMClient in memory/memory_keeper.py but designed
    for synchronous use inside orchestrator.process_jcode_request().
    """

    base_url: str = field(
        default_factory=lambda: os.environ.get(
            "LITELLM_BASE_URL", "http://127.0.0.1:4000/v1"
        ).rstrip("/")
    )
    api_key: str = field(
        default_factory=lambda: os.environ.get(
            "LITELLM_API_KEY", "grey-os-local"
        )
    )
    default_model: str = field(
        default_factory=lambda: os.environ.get(
            "KORE_AGENT_MODEL", "flash-k2"
        )
    )
    timeout: float = 120.0
    temperature: float = 0.2
    max_tokens: int = 4096

    def complete(
        self,
        prompt: str,
        *,
        model: Optional[str] = None,
        system: Optional[str] = None,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Send a completion request to the LiteLLM proxy.

        Args:
            prompt: User prompt content.
            model: Model alias (default: KORE_AGENT_MODEL env or 'flash-k2').
            system: Optional system message.
            temperature: Override default temperature.
            max_tokens: Override default max_tokens.

        Returns:
            Dict with 'content', 'model', 'tokens_used', 'finish_reason', 'latency_ms'.
            On error, returns 'content': '' and 'error': str.
        """
        import time

        start = time.perf_counter()

        messages: List[Dict[str, str]] = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})

        payload = {
            "model": model or self.default_model,
            "messages": messages,
            "max_tokens": max_tokens or self.max_tokens,
            "temperature": temperature if temperature is not None else self.temperature,
        }

        body = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            f"{self.base_url}/chat/completions",
            data=body,
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )

        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                data = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            latency_ms = (time.perf_counter() - start) * 1000
            error_body = ""
            try:
                error_body = e.read().decode("utf-8")[:500]
            except Exception:
                pass
            return {
                "content": "",
                "model": model or self.default_model,
                "tokens_used": 0,
                "finish_reason": "error",
                "latency_ms": round(latency_ms, 3),
                "error": f"HTTP {e.code}: {error_body}",
            }
        except urllib.error.URLError as e:
            latency_ms = (time.perf_counter() - start) * 1000
            return {
                "content": "",
                "model": model or self.default_model,
                "tokens_used": 0,
                "finish_reason": "error",
                "latency_ms": round(latency_ms, 3),
                "error": f"Connection error: {e.reason}",
            }
        except Exception as e:
            latency_ms = (time.perf_counter() - start) * 1000
            return {
                "content": "",
                "model": model or self.default_model,
                "tokens_used": 0,
                "finish_reason": "error",
                "latency_ms": round(latency_ms, 3),
                "error": str(e),
            }

        latency_ms = (time.perf_counter() - start) * 1000

        choice = data.get("choices", [{}])[0]
        content = choice.get("message", {}).get("content", "")
        # Handle Anthropic-style content blocks
        if isinstance(content, list):
            content = "".join(
                part.get("text", "") if isinstance(part, dict) else str(part)
                for part in content
            )

        return {
            "content": content,
            "model": data.get("model", model or self.default_model),
            "tokens_used": data.get("usage", {}).get("total_tokens", len(content)),
            "finish_reason": choice.get("finish_reason", "stop"),
            "latency_ms": round(latency_ms, 3),
        }

    def health_check(self) -> Dict[str, Any]:
        """Check if the LiteLLM proxy is reachable.

        Returns:
            Dict with 'reachable': bool, 'latency_ms': float, 'models': list or None.
        """
        import time

        start = time.perf_counter()
        try:
            req = urllib.request.Request(
                f"{self.base_url}/models",
                headers={"Authorization": f"Bearer {self.api_key}"},
                method="GET",
            )
            with urllib.request.urlopen(req, timeout=5) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            latency_ms = (time.perf_counter() - start) * 1000
            models = data.get("data", [])
            return {
                "reachable": True,
                "latency_ms": round(latency_ms, 3),
                "model_count": len(models),
                "models": [m.get("id", "?") for m in models[:10]],
            }
        except Exception as e:
            latency_ms = (time.perf_counter() - start) * 1000
            return {
                "reachable": False,
                "latency_ms": round(latency_ms, 3),
                "error": str(e),
            }


# ── Module-level singleton (harvest the existing config) ────────────────────

_bridge: Optional[LiteLLMBridge] = None


def get_bridge() -> LiteLLMBridge:
    """Get or create the module-level LiteLLM bridge singleton."""
    global _bridge
    if _bridge is None:
        _bridge = LiteLLMBridge()
    return _bridge


def reset_bridge() -> None:
    """Reset the bridge singleton (for testing)."""
    global _bridge
    _bridge = None
