"""
MCP (Model Context Protocol) integration.

Provides:
  - GET  /mcp/manifest   → MCP tool listing (auto-discovered by Claude, Cursor, etc.)
  - POST /mcp/call       → Execute verify_claim tool

Allows any MCP-compatible client to use KORE verify as a native tool.
"""

import json, logging, time, uuid
from fastapi import APIRouter, Depends, HTTPException

from middleware.auth import require_auth, AuthContext
from middleware.billing import check_and_record
from middleware.logger import log_call

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/mcp")


MCP_MANIFEST = {
    "name": "kore-compliance-verifier",
    "version": "1.0.0",
    "description": "Verify AI-generated answers against source documents",
    "tools": [{
        "name": "verify_claim",
        "description": "Verify whether an answer is grounded in provided source documents",
        "input_schema": {
            "type": "object",
            "properties": {
                "question": {"type": "string", "description": "The question being answered"},
                "answer": {"type": "string", "description": "The answer to verify"},
                "sources": {"type": "array", "items": {"type": "object",
                    "properties": {"id": {"type": "string"}, "content": {"type": "string"}}}},
                "mode": {"type": "string", "enum": ["strict", "balanced", "lenient"]},
            },
            "required": ["question", "answer", "sources"],
        },
    }],
}


@router.get("/manifest")
async def mcp_manifest():
    return MCP_MANIFEST


@router.post("/call")
async def mcp_call(payload: dict, auth: AuthContext = Depends(require_auth)):
    t0 = time.time()

    tool_name = payload.get("tool", "")
    args = payload.get("args", {})

    if tool_name != "verify_claim":
        raise HTTPException(400, f"Unknown tool: {tool_name}")

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
            result = await real_verify(
                question=args.get("question", ""),
                answer=args.get("answer", ""),
                sources=args.get("sources", []),
                rules=args.get("rules"),
                mode=args.get("mode", "balanced"),
            )
            resp = result.to_dict()
        else:
            resp = _mock_verify(
                args.get("question", ""),
                args.get("answer", ""),
                args.get("sources", []),
                args.get("rules"),
                args.get("mode", "balanced"),
            )

        duration_ms = (time.time() - t0) * 1000
        log_call("POST", "/mcp/call", 200, duration_ms, auth.tier, auth.customer_id, resp)

        return {"result": resp, "quota_remaining": billing["quota_remaining"]}

    except PermissionError as e:
        raise HTTPException(429, detail=str(e))
    except Exception as e:
        logger.error(f"MCP verify failed: {e}", exc_info=True)
        raise HTTPException(500, detail="Verification failed")
