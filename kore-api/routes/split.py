"""
ΣSplit — Task Decomposer.

Splits complex tasks into independent subtasks for parallel execution.
RC 7/7 · $27k/mo at M6
"""

import logging, time, uuid, re
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from middleware.auth import require_auth, AuthContext
from middleware.billing import check_and_record
from middleware.logger import log_call

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/v1/split")


class SplitRequest(BaseModel):
    task: str = Field(..., max_length=16000)
    max_subtasks: int = Field(default=5, ge=1, le=20)


SPLIT_PATTERNS = [
    (r"(first|step 1|1\.)\s", "sequential"),
    (r"(and|also|additionally|moreover|furthermore)", "parallel"),
    (r"(implement|create|build|write|develop|design)", "build"),
    (r"(test|verify|validate|check|review|audit)", "verify"),
    (r"(document|explain|describe|summarize|analyze)", "document"),
]


def _decompose(task: str, max_n: int) -> list[dict]:
    sentences = re.split(r'(?<=[.!?])\s+', task)
    subtasks = []
    for i, s in enumerate(sentences[:max_n]):
        s = s.strip()
        if not s or len(s) < 10:
            continue
        # Determine type
        st = "general"
        for pattern, label in SPLIT_PATTERNS:
            if pattern and re.search(pattern, s, re.I):
                st = label
                break
        subtasks.append({
            "id": f"sub_{i+1:02d}",
            "description": s[:200],
            "type": st,
            "estimated_complexity": round(0.3 + (len(s) / 1000) * 0.5, 2),
        })
    return subtasks


@router.post("")
async def split(req: SplitRequest, auth: AuthContext = Depends(require_auth)):
    t0 = time.time()
    billing = check_and_record(auth.tier, auth.customer_id)
    subtasks = _decompose(req.task, req.max_subtasks)

    resp = {
        "subtasks": subtasks,
        "count": len(subtasks),
        "parallel_possible": any(s["type"] == "parallel" for s in subtasks),
        "latency_ms": round((time.time() - t0) * 1000, 1),
        "quota_remaining": billing["quota_remaining"],
    }
    log_call("POST", "/v1/split", 200, resp["latency_ms"], auth.tier, auth.customer_id, resp)
    return resp
