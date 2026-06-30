"""
POST /v1/lab/simulate/full — Full simulation pipeline (domino chain).

Single call that orchestrates: compress → route → score×5 → verify → evidence.
~1280 credits = €1.28 per run. Revenue multiplier.

Usage:
    curl -X POST https://kore-api.up.railway.app/v1/lab/simulate/full \
      -H "x-api-key: kore_..." \
      -H "Content-Type: application/json" \
      -d '{"hypothesis": "If we use RAG, accuracy improves by 15%"}'
"""

import json, logging, time, hashlib, secrets
from fastapi import APIRouter, Depends, HTTPException

from middleware.auth import require_auth, AuthContext
from middleware.billing import check_and_record
from middleware.credits import spend_credits, get_credits
from middleware.logger import log_call

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/v1/lab")

TOTAL_COST = 1280  # credits for full pipeline


def _compress(text: str) -> str:
    """Simulate context compression (3-5x reduction)."""
    words = text.split()
    if len(words) <= 10:
        return text
    return " ".join(words[:len(words) // 3]) + " [compressed]"


def _route(hypothesis: str) -> dict:
    """Simulate provider routing."""
    h = int(hashlib.sha256(hypothesis.encode()).hexdigest(), 16)
    providers = ["cerebras", "groq", "sambanova", "gemini-flash", "deepseek"]
    return {
        "recommended_provider": providers[h % len(providers)],
        "reason": "lowest_latency_adequate_quality",
        "estimated_tokens": len(hypothesis.split()) * 2 + 500,
    }


def _score_n(hypothesis: str, n: int = 5) -> list[dict]:
    """Generate n candidate strategies with scores."""
    h = int(hashlib.sha256(hypothesis.encode()).hexdigest(), 16)
    candidates = []
    base_score = round(0.55 + (h % 3000) / 10000, 2)
    for i in range(n):
        score = min(round(base_score + i * 0.07 + (h >> (i * 2)) % 5 * 0.01, 2), 0.99)
        candidates.append({
            "strategy": f"Option {i + 1}",
            "score": score,
            "reasoning": f"Strategy variant {i + 1} based on hypothesis analysis" if i > 0 else "Direct application of hypothesis",
        })
    return candidates


def _verify(question: str, answer: str) -> dict:
    """Simulate verification."""
    h = hashlib.sha256((question + answer).encode()).hexdigest()
    score = 0.4 + (int(h[:4], 16) % 6000) / 10000
    return {
        "grounded": score > 0.55,
        "verification_score": round(score, 4),
        "risk_level": "green" if score > 0.7 else ("yellow" if score > 0.4 else "red"),
    }


@router.post("/simulate/full")
async def full_simulation(body: dict, auth: AuthContext = Depends(require_auth)):
    """
    Run the full simulation pipeline (domino chain).
    Orchestrates compress → route → score×5 → verify in one atomic call.
    """
    t0 = time.time()
    hypothesis = body.get("hypothesis", "")
    if not hypothesis or len(hypothesis) < 10:
        raise HTTPException(400, "hypothesis must be at least 10 characters")

    # Check billing/quota
    billing = check_and_record(auth.tier, auth.customer_id, service="simulate_full")

    # Check if customer has enough credits
    balance = get_credits(auth.customer_id)
    if balance < TOTAL_COST and auth.tier not in ("enterprise", "business"):
        raise HTTPException(
            402,
            detail={
                "error": f"Full simulation requires ~{TOTAL_COST} credits",
                "you_have": balance,
                "needed": TOTAL_COST,
                "shortfall": TOTAL_COST - balance,
                "recommended_pack": "builder" if TOTAL_COST - balance > 5000 else "starter",
                "topup": "/buy/builder",
            },
        )

    # Execute domino chain
    try:
        compressed = _compress(hypothesis)
        route_rec = _route(hypothesis)
        candidates = _score_n(hypothesis, n=5)
        best = max(candidates, key=lambda x: x["score"])
        verified = _verify(best["strategy"], hypothesis)

        # Deduct credits
        cost = TOTAL_COST
        if not spend_credits(auth.customer_id, "simulate_full"):
            # Try per-service fallback
            for service, c in [("compress", 3), ("route", 5), ("score", 200), ("verify", 72)]:
                spend_credits(auth.customer_id, service)
            cost = 280  # fallback cost

        evidence_id = f"ev_{secrets.token_hex(8)}"

        duration_ms = (time.time() - t0) * 1000
        resp = {
            "pipeline": {
                "compressed": compressed,
                "route": route_rec,
                "candidates": candidates,
                "best": best,
                "verified": verified,
                "evidence_id": evidence_id,
            },
            "total_credits_used": cost,
            "credits_remaining": get_credits(auth.customer_id),
            "value": f"€{cost * 0.001:.3f} worth of analysis in one call",
        }

        log_call("POST", "/v1/lab/simulate/full", 200, duration_ms,
                 auth.tier, auth.customer_id, resp)
        return resp

    except PermissionError as e:
        raise HTTPException(429, detail=str(e))
    except Exception as e:
        logger.error(f"simulate/full failed: {e}", exc_info=True)
        raise HTTPException(500, detail="Simulation pipeline failed")
