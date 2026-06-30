"""
POST /a2a/tasks/send — Google A2A protocol endpoint.

Agents send structured tasks with parts (text + file + data).
KORE extracts verification params and returns A2A-compliant response.

Spec: https://google.github.io/A2A/#/documentation
"""

import json, logging, time, uuid
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from middleware.auth import require_auth, AuthContext
from middleware.billing import check_and_record
from middleware.logger import log_call

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/a2a")


# ── A2A Schema ───────────────────────────────────────────────────────────

class A2APart(BaseModel):
    type: str = "text"  # text | file | data
    text: str | None = None

class A2AMessage(BaseModel):
    role: str = "user"
    parts: list[A2APart] = []

class A2ATask(BaseModel):
    id: str = Field(default_factory=lambda: f"task_{uuid.uuid4().hex[:12]}")
    sessionId: str = ""
    messages: list[A2AMessage] = []


@router.post("/tasks/send")
async def tasks_send(task: A2ATask, auth: AuthContext = Depends(require_auth)):
    t0 = time.time()

    # Extract question + answer from A2A message parts
    question = ""
    answer = ""
    sources = []
    for msg in task.messages:
        for part in msg.parts:
            if part.type == "text" and not question:
                question = part.text or ""
            elif part.type == "text" and question and not answer:
                answer = part.text or ""

    if not question:
        return {
            "id": task.id,
            "status": {"state": "failed", "error": "No question found in message parts"},
        }

    # Build verify request
    verify_body = {
        "question": question,
        "answer": answer or "(no answer provided)",
        "sources": sources or [{"id": "default", "content": "(no sources)"}],
        "mode": "balanced",
    }

    # Call internal verify
    try:
        from routes.verify import _mock_verify
        HAS_REAL = False
        try:
            import sys; sys.path.insert(0, ".")
            from kore.compliance.verifier import verify as real_verify
            HAS_REAL = True
        except ImportError:
            pass

        billing = check_and_record(auth.tier, auth.customer_id)

        if HAS_REAL:
            result = await real_verify(**verify_body)
            resp = result.to_dict()
        else:
            resp = _mock_verify(**verify_body, rules=None)

        duration_ms = (time.time() - t0) * 1000
        log_call("POST", "/a2a/tasks/send", 200, duration_ms, auth.tier, auth.customer_id, resp)

        return {
            "id": task.id,
            "sessionId": task.sessionId,
            "status": {"state": "completed"},
            "result": {
                "parts": [{
                    "type": "data",
                    "data": resp,
                }],
            },
        }

    except PermissionError as e:
        raise HTTPException(429, detail=str(e))
    except Exception as e:
        logger.error(f"A2A verify failed: {e}", exc_info=True)
        return {
            "id": task.id,
            "status": {"state": "failed", "error": "Verification failed"},
        }
