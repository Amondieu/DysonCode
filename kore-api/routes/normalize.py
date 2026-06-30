"""
ΛNorm — Prompt Normalizer.

Sits as pre-flight gate before all other services.
Strips noise, detects injections, normalizes whitespace,
and returns token-count delta.

Implementation: purely algorithmic. No external dependencies.
"""

import re, logging, time
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from middleware.auth import require_auth, AuthContext
from middleware.billing import check_and_record
from middleware.logger import log_call

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/v1/normalize")


class NormalizeRequest(BaseModel):
    text: str = Field(..., max_length=64000)
    mode: str = Field(default="balanced", pattern="^(minimal|balanced|strict)$")


# ── Injection patterns ──────────────────────────────────────────────────

INJECTION_PATTERNS = [
    (re.compile(r"ignore all previous instructions", re.I), "instruction_override"),
    (re.compile(r"forget (everything|all|your training)", re.I), "memory_reset"),
    (re.compile(r"you are (now|not) (a|an) ", re.I), "role_reassign"),
    (re.compile(r"system prompt", re.I), "system_leak"),
    (re.compile(r"<\|[a-z_]+\|>"), "special_token"),
    (re.compile(r"\[END\]|\[START\]|\[SYSTEM\]", re.I), "control_token"),
    (re.compile(r"(\+\s*)+---|\-\-\-\s*\+"), "delimiter_abuse"),
    (re.compile(r"repeat (after me|this|the following)", re.I), "prompt_leak"),
    (re.compile(r"(https?://|www\.)\S+"), "url_injection"),
    (re.compile(r"(base64|hex|decode|encode)\s*\(.*\)", re.I), "encoding_attack"),
]


def _detect_injections(text: str) -> list[dict]:
    findings = []
    for pattern, label in INJECTION_PATTERNS:
        matches = pattern.findall(text)
        if matches:
            findings.append({"type": label, "count": len(matches), "confidence": min(1.0, len(matches) * 0.3)})
    return findings


def _normalize(text: str, mode: str) -> str:
    """Normalize prompt text."""
    if mode == "minimal":
        text = re.sub(r"\s+", " ", text).strip()
        return text

    # balanced (default)
    text = re.sub(r"\s+", " ", text).strip()
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"[^\S\n]{2,}", " ", text)
    text = re.sub(r"```\s*\n\s*```", "``````", text)
    return text

    # strict (not fully implemented — would remove markdown, trim more aggressively)


@router.post("")
async def normalize(req: NormalizeRequest, auth: AuthContext = Depends(require_auth)):
    t0 = time.time()
    billing = check_and_record(auth.tier, auth.customer_id)

    original_tokens = len(req.text.split())
    injections = _detect_injections(req.text)
    normalized = _normalize(req.text, req.mode)
    normalized_tokens = len(normalized.split())

    risk_score = min(1.0, sum(f["confidence"] for f in injections) / max(len(injections), 1))

    resp = {
        "normalized": normalized if risk_score < 0.7 else req.text,
        "original_tokens": original_tokens,
        "normalized_tokens": normalized_tokens,
        "tokens_saved": max(0, original_tokens - normalized_tokens),
        "injection_flags": injections,
        "injection_count": len(injections),
        "risk_score": round(risk_score, 4),
        "mode": req.mode,
        "blocked": risk_score >= 0.7,
        "latency_ms": round((time.time() - t0) * 1000, 1),
        "quota_remaining": billing["quota_remaining"],
    }

    log_call("POST", "/v1/normalize", 200, resp["latency_ms"], auth.tier, auth.customer_id, resp)
    return resp
