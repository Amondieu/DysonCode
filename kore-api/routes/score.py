"""
ΘScore — Output Quality Scorer.

Ranks multiple candidate outputs by quality using heuristic metrics.
RC 7/7 · $27k/mo at M6
"""

import logging, time, uuid, re
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from middleware.auth import require_auth, AuthContext
from middleware.billing import check_and_record
from middleware.logger import log_call

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/v1/score")


class Candidate(BaseModel):
    id: str
    output: str = Field(..., max_length=16000)

class ScoreRequest(BaseModel):
    task: str = Field(..., max_length=8000)
    candidates: list[Candidate] = Field(..., min_length=1, max_length=10)
    rubric: str | None = None


def _heuristic_score(output: str, task: str) -> dict:
    lines = output.strip().split('\n')
    words = output.split()
    score = 0.5

    # Length: prefer 50-500 words
    if 50 <= len(words) <= 500:
        score += 0.1
    elif len(words) < 10:
        score -= 0.2

    # Code indicators
    if re.search(r'(def |class |import |function|const |let )', output):
        score += 0.15

    # Structured output
    if re.search(r'(^|\n)[-#*] ', output):
        score += 0.05
    if '|' in output and '---' in output:
        score += 0.05

    # Task keyword coverage
    task_words = set(w.lower() for w in re.findall(r'\w{4,}', task))
    output_words = set(w.lower() for w in re.findall(r'\w{4,}', output))
    if task_words:
        coverage = len(task_words & output_words) / len(task_words)
        score += coverage * 0.15

    return {"score": round(min(1.0, score), 4), "length": len(words), "has_code": score > 0.65}


@router.post("")
async def score(req: ScoreRequest, auth: AuthContext = Depends(require_auth)):
    t0 = time.time()
    billing = check_and_record(auth.tier, auth.customer_id)

    scored = []
    for c in req.candidates:
        result = _heuristic_score(c.output, req.task)
        scored.append({"id": c.id, **result})

    scored.sort(key=lambda x: -x["score"])
    scores = [s["score"] for s in scored]
    spread = max(scores) - min(scores) if scores else 0

    resp = {
        "ranked_candidates": scored,
        "recommended_index": scored[0]["id"] if scored else None,
        "mean_score": round(sum(scores) / len(scores), 4) if scores else 0,
        "score_spread": round(spread, 4),
        "latency_ms": round((time.time() - t0) * 1000, 1),
        "quota_remaining": billing["quota_remaining"],
    }
    log_call("POST", "/v1/score", 200, resp["latency_ms"], auth.tier, auth.customer_id, resp)
    return resp
