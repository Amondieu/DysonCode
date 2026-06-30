"""
ΨGuard — Hallucination Firewall.

Sits as the last gate before agent output emission.
Checks claims against provided sources, flags unsupported statements.

RC 7/7 · Risk 1/5
Projected: $22k/mo at M6, $28k/mo at M12
"""

import logging, time, uuid, re
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from middleware.auth import require_auth, AuthContext
from middleware.billing import check_and_record
from middleware.logger import log_call

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/v1/guard")


class GuardRequest(BaseModel):
    output: str = Field(..., max_length=32000)
    sources: list[str] = Field(default_factory=list, max_length=20)
    threshold: float = Field(default=0.85, ge=0.0, le=1.0)


def _extract_claims(text: str) -> list[str]:
    """Simple claim extraction — split by sentences and filter factual statements."""
    sentences = re.split(r'(?<=[.!?])\s+', text)
    claims = []
    for s in sentences:
        s = s.strip()
        if not s:
            continue
        # Skip questions, commands, greetings
        if s.endswith('?') or s.startswith(('Who', 'What', 'When', 'Where', 'Why', 'How', 'Please', 'Can you')):
            continue
        if len(s) > 20 and any(w in s.lower() for w in ['is', 'are', 'was', 'were', 'has', 'have', 'will', 'can', 'must', 'should']):
            claims.append(s)
    return claims


def _check_claim_against_sources(claim: str, sources: list[str]) -> tuple[bool, float]:
    """Simple keyword-overlap hallucination check."""
    if not sources:
        return False, 0.0

    claim_words = set(w.lower() for w in re.findall(r'\w{4,}', claim))
    if not claim_words:
        return False, 0.5

    best_overlap = 0.0
    for source in sources:
        source_words = set(w.lower() for w in re.findall(r'\w{4,}', source))
        if not source_words:
            continue
        overlap = len(claim_words & source_words) / len(claim_words)
        best_overlap = max(best_overlap, overlap)

    supported = best_overlap > 0.3
    confidence = min(1.0, best_overlap + 0.2)
    return supported, confidence


@router.post("")
async def guard(req: GuardRequest, auth: AuthContext = Depends(require_auth)):
    t0 = time.time()
    billing = check_and_record(auth.tier, auth.customer_id)

    claims = _extract_claims(req.output)
    flagged = []
    supported_count = 0

    for claim in claims:
        supported, confidence = _check_claim_against_sources(claim, req.sources)
        if supported:
            supported_count += 1
        elif confidence < req.threshold:
            flagged.append({
                "claim": claim[:200],
                "confidence": round(confidence, 4),
                "reason": "insufficient source support",
            })

    safe = len(flagged) == 0
    hallucination_score = round(1.0 - (supported_count / max(len(claims), 1)), 4)

    resp = {
        "safe": safe,
        "hallucination_score": hallucination_score,
        "flagged_claims": flagged,
        "total_claims": len(claims),
        "supported_claims": supported_count,
        "revision_hint": None if safe else "Verify each claim against provided sources",
        "threshold_used": req.threshold,
        "latency_ms": round((time.time() - t0) * 1000, 1),
        "quota_remaining": billing["quota_remaining"],
    }

    log_call("POST", "/v1/guard", 200, resp["latency_ms"], auth.tier, auth.customer_id, resp)
    return resp
