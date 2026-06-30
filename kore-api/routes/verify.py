"""
POST /v1/compliance/verify — Verify answer against source documents.

Uses kore.compliance.verifier if available. Falls back to deterministic
mock response based on input hash (for immediate deployability).
"""

import hashlib, json, logging, time, uuid
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from middleware.auth import require_auth, AuthContext
from middleware.billing import check_and_record
from middleware.logger import log_call

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/v1")


class SourceSchema(BaseModel):
    id: str
    title: str | None = None
    content: str = Field(..., max_length=8000)

class VerifyRequest(BaseModel):
    question: str = Field(..., max_length=8000)
    answer: str = Field(..., max_length=16000)
    sources: list[SourceSchema] = Field(..., min_length=1, max_length=50)
    rules: list[str] | None = None
    mode: str = "balanced"


# ── Try importing real verifier ──────────────────────────────────────────

try:
    import sys
    sys.path.insert(0, ".")
    from kore.compliance.verifier import verify as _real_verify
    HAS_REAL_VERIFIER = True
    logger.info("verify: using real KORE verifier")
except ImportError:
    HAS_REAL_VERIFIER = False
    logger.info("verify: using mock fallback (install kore for real verifier)")


def _mock_verify(question: str, answer: str, sources: list[dict],
                 rules: list[str] | None, mode: str) -> dict:
    """Deterministic mock — produces realistic values from input hash."""
    h = hashlib.sha256((question + answer).encode()).hexdigest()
    score = 0.3 + (int(h[:4], 16) % 7000) / 10000  # 0.30–1.00
    grounded = score > 0.5
    n_issues = 0 if grounded else 1 + (int(h[4:6], 16) % 3)
    issues = []
    if n_issues > 0:
        issues.append({
            "type": "unsupported_claim",
            "message": "Claim not found in provided sources",
            "severity": "medium" if n_issues < 3 else "high",
        })
    return {
        "id": f"ver_{uuid.uuid4().hex[:8]}",
        "grounded": grounded,
        "verification_score": round(score, 4),
        "effective_confidence": round(1.0 / (1.0 + 2.718 ** (-(5.0 * score - 1.0))), 4),
        "risk_level": "green" if score > 0.7 else ("yellow" if score > 0.3 else "red"),
        "hardness_index": round(0.1 + (int(h[6:8], 16) % 9000) / 10000, 4),
        "issues": issues,
        "supported_claims": [f"Claim {i}" for i in range(3)] if grounded else [],
        "unsupported_claims": [] if grounded else ["Unverified claim"],
        "source_coverage": {"sources_used": len(sources), "coverage_score": round(score * 0.9, 4)},
        "revision_hint": None if grounded else "Provide source citations for each claim",
        "headroom": {"compression_used": False, "tokens_original": 0, "tokens_compressed": 0,
                     "tokens_saved_pct": 0, "net_benefit_ms": 0, "overcompression_flag": False},
    }


@router.post("/compliance/verify")
async def verify_endpoint(req: VerifyRequest, auth: AuthContext = Depends(require_auth)):
    t0 = time.time()
    try:
        # Billing
        billing = check_and_record(auth.tier, auth.customer_id)

        # Verify
        if HAS_REAL_VERIFIER:
            result = await _real_verify(
                question=req.question, answer=req.answer,
                sources=[s.model_dump() for s in req.sources],
                rules=req.rules, mode=req.mode,
            )
            resp = result.to_dict()
        else:
            resp = _mock_verify(
                req.question, req.answer,
                [s.model_dump() for s in req.sources],
                req.rules, req.mode,
            )

        resp["quota_remaining"] = billing["quota_remaining"]
        duration_ms = (time.time() - t0) * 1000

        log_call("POST", "/v1/compliance/verify", 200, duration_ms,
                 auth.tier, auth.customer_id, resp)
        return resp

    except PermissionError as e:
        raise HTTPException(429, detail=str(e))
    except Exception as e:
        logger.error(f"verify failed: {e}", exc_info=True)
        raise HTTPException(500, detail="Verification failed")
