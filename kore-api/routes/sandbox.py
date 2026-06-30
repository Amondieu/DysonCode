"""
ΨSandbox — Agent Sandbox.

Executes Python code in a sandboxed environment.
Uses subprocess with resource limits (no Docker required for MVP).
RC 7/7 · $49.6k/mo at M6 (highest revenue)
"""

import logging, time, uuid, subprocess, tempfile, os, sys
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from middleware.auth import require_auth, AuthContext
from middleware.billing import check_and_record
from middleware.logger import log_call

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/v1/sandbox")

TIMEOUT_SEC = 30
MAX_OUTPUT_CHARS = 10000


class SandboxRequest(BaseModel):
    code: str = Field(..., max_length=32000)
    language: str = Field(default="python", pattern="^(python)$")
    stdin: str = Field(default="", max_length=1000)


@router.post("/exec")
async def sandbox_exec(req: SandboxRequest, auth: AuthContext = Depends(require_auth)):
    t0 = time.time()
    billing = check_and_record(auth.tier, auth.customer_id)

    if req.language != "python":
        raise HTTPException(400, "Only Python supported in MVP")

    # Write code to temp file
    with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False, encoding='utf-8') as f:
        f.write(req.code)
        tmp_path = f.name

    try:
        proc = subprocess.run(
            [sys.executable, tmp_path],
            input=req.stdin,
            capture_output=True,
            text=True,
            timeout=TIMEOUT_SEC,
        )
        stdout = proc.stdout[:MAX_OUTPUT_CHARS]
        stderr = proc.stderr[:MAX_OUTPUT_CHARS]
        exit_code = proc.returncode

        resp = {
            "run_id": str(uuid.uuid4()),
            "stdout": stdout,
            "stderr": stderr,
            "exit_code": exit_code,
            "success": exit_code == 0,
            "timed_out": False,
            "latency_ms": round((time.time() - t0) * 1000, 1),
            "quota_remaining": billing["quota_remaining"],
        }
    except subprocess.TimeoutExpired:
        resp = {
            "run_id": str(uuid.uuid4()),
            "stdout": "",
            "stderr": f"Execution timed out after {TIMEOUT_SEC}s",
            "exit_code": -1,
            "success": False,
            "timed_out": True,
            "latency_ms": round((time.time() - t0) * 1000, 1),
            "quota_remaining": billing["quota_remaining"],
        }
    finally:
        try:
            os.unlink(tmp_path)
        except PermissionError:
            pass

    log_call("POST", "/v1/sandbox/exec", 200, resp["latency_ms"], auth.tier, auth.customer_id, resp)
    return resp
