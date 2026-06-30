"""
OWASP LLM Top 10 Security Middleware for KORE API.

Covers:
  LLM01 — Prompt Injection sanitizer
  LLM06 — Secret redaction in logs
  LLM10 — Token hard-cap per request
  API   — Security headers
"""

import re, logging
from fastapi import Request, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger(__name__)

# ── LLM01: Prompt Injection Patterns ────────────────────────────────────

INJECTION_PATTERNS = [
    "ignore previous", "ignore all instructions",
    "system prompt", "jailbreak", "dan mode",
    "override", "forget your", "new persona",
    "you are now", "act as a", "developer mode",
    "print your", "output your", "reveal your",
]

def detect_injection(text: str) -> str | None:
    """Check text for injection patterns. Returns first match or None."""
    lower = text.lower()
    for pattern in INJECTION_PATTERNS:
        if pattern in lower:
            return pattern
    return None


# ── LLM06: Secret Redaction ─────────────────────────────────────────────

SECRET_PATTERNS = [
    re.compile(r'(sk-[a-zA-Z0-9]{20,45})'),           # OpenAI/OpenRouter
    re.compile(r'(gsk_[a-zA-Z0-9]{20,45})'),          # Groq
    re.compile(r'(AIza[a-zA-Z0-9]{35})'),             # Google AI
    re.compile(r'(ghp_[a-zA-Z0-9]{36})'),             # GitHub PAT
    re.compile(r'(hf_[a-zA-Z0-9]{20,45})'),           # HuggingFace
    re.compile(r'(xai-[a-zA-Z0-9]{20,})'),            # xAI
]

def redact_secrets(text: str) -> str:
    """Replace API keys and tokens with [REDACTED]."""
    result = text
    for pattern in SECRET_PATTERNS:
        result = pattern.sub("[REDACTED]", result)
    return result


# ── LLM10: Token Hard-Cap ───────────────────────────────────────────────

MAX_INPUT_CHARS = 32000   # ~8000 tokens
MAX_OUTPUT_CHARS = 16000  # ~4000 tokens


# ── Middleware ──────────────────────────────────────────────────────────

_INJECTION_ENDPOINTS = {"/v1/guard", "/v1/normalize", "/v1/score",
                        "/v1/compliance/verify", "/v1/memory/write",
                        "/v1/provenance/certify", "/v1/sandbox/exec",
                        "/a2a/tasks/send", "/mcp/call"}


class SecurityMiddleware(BaseHTTPMiddleware):
    """Applies security checks to all requests."""

    async def dispatch(self, request: Request, call_next):
        # Security headers on every response
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["X-LLM-Protected"] = "kore-security-v1"

        return response


async def check_injection_and_size(request: Request):
    """Dependency: check prompt injection + size limits on LLM endpoints."""
    path = request.url.path

    # Only check LLM-facing endpoints
    if path not in _INJECTION_ENDPOINTS:
        return

    body = await request.body()
    text = body.decode("utf-8", errors="replace")

    # LLM10: Token hard-cap
    if len(text) > MAX_INPUT_CHARS:
        raise HTTPException(413, detail=f"Input too large: {len(text)} chars (max {MAX_INPUT_CHARS})")

    # LLM01: Prompt injection
    match = detect_injection(text)
    if match:
        logger.warning(f"Injection detected on {path}: '{match}'")
        raise HTTPException(400, detail=f"Input rejected: pattern '{match}' detected")

    # LLM06: Redact secrets in request body (for logging)
    # Store redacted version on request state for logger middleware
    request.state.redacted_body = redact_secrets(text)
