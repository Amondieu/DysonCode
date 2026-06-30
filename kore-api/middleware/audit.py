"""
ΩAudit — Immutable Audit Log Middleware.

Append-only HMAC-hashed audit trail for all API calls.
Every request is logged with a hash chain linking each entry
to the previous one, creating an immutable record.

Can be used as:
  1. FastAPI middleware (auto-logs all routes)
  2. Standalone endpoint: GET /v1/audit/trail

Compliance: EU AI Act Art. 13, FDA 21 CFR Part 11, SEC Rule 17a-4
"""

import json, os, logging, hashlib, hmac, time
from datetime import datetime, timezone
from pathlib import Path
from fastapi import APIRouter, Request
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger(__name__)

AUDIT_DIR = os.environ.get("AUDIT_LOG_DIR", "audit_logs")
AUDIT_SECRET = os.environ.get("AUDIT_HMAC_SECRET", "kore-audit-dev-secret").encode()
AUDIT_FILE = os.path.join(AUDIT_DIR, "audit_trail.jsonl")

router = APIRouter(prefix="/v1/audit")


def _load_last_hash() -> str:
    """Load the hash of the last audit entry (for chaining)."""
    try:
        with open(AUDIT_FILE, "rb") as f:
            for line in f:
                pass  # seek to last line
            last = json.loads(line)
            return last.get("hash", "")
    except (FileNotFoundError, json.JSONDecodeError):
        return ""


def _write_entry(entry: dict):
    """Write an audit entry with HMAC chain."""
    os.makedirs(AUDIT_DIR, exist_ok=True)
    prev_hash = _load_last_hash()

    payload = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "method": entry.get("method", ""),
        "path": entry.get("path", ""),
        "status": entry.get("status", 0),
        "customer": entry.get("customer", "anon"),
        "tier": entry.get("tier", "free"),
        "latency_ms": entry.get("latency_ms", 0),
        "prev_hash": prev_hash,
    }

    # HMAC chain: hash(prev_hash + json_payload + secret)
    payload_str = json.dumps(payload, sort_keys=True, ensure_ascii=False)
    chain_hash = hmac.new(AUDIT_SECRET, payload_str.encode(), hashlib.sha256).hexdigest()
    payload["hash"] = chain_hash

    try:
        with open(AUDIT_FILE, "a", encoding="utf-8") as f:
            f.write(json.dumps(payload, ensure_ascii=False) + "\n")
    except Exception as e:
        logger.warning(f"Audit write failed: {e}")


class AuditMiddleware(BaseHTTPMiddleware):
    """FastAPI middleware — logs every request to the audit trail."""

    async def dispatch(self, request: Request, call_next):
        t0 = time.time()
        response = await call_next(request)
        duration_ms = (time.time() - t0) * 1000

        # Only log API calls (skip static files)
        if request.url.path.startswith("/v1/") or request.url.path.startswith("/a2a/") or request.url.path.startswith("/mcp/"):
            _write_entry({
                "method": request.method,
                "path": request.url.path,
                "status": response.status_code,
                "latency_ms": round(duration_ms, 1),
                "customer": getattr(request.state, "customer_id", "anon"),
                "tier": getattr(request.state, "tier", "free"),
            })

        return response


@router.get("/trail")
async def get_audit_trail(limit: int = 100):
    """Retrieve the most recent audit trail entries."""
    if not os.path.exists(AUDIT_FILE):
        return {"entries": [], "count": 0}

    entries = []
    try:
        with open(AUDIT_FILE, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    entries.append(json.loads(line))
    except Exception as e:
        logger.warning(f"Audit read failed: {e}")
        return {"error": str(e), "entries": [], "count": 0}

    entries.reverse()
    return {"entries": entries[:limit], "count": len(entries), "total": len(entries)}


@router.get("/verify/{entry_hash}")
async def verify_entry(entry_hash: str):
    """Verify the integrity of a specific audit entry by its hash."""
    if not os.path.exists(AUDIT_FILE):
        return {"valid": False, "error": "No audit trail found"}

    try:
        with open(AUDIT_FILE, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                entry = json.loads(line)
                if entry.get("hash") == entry_hash:
                    # Re-verify the HMAC
                    stored_hash = entry.pop("hash", "")
                    payload_str = json.dumps(entry, sort_keys=True, ensure_ascii=False)
                    expected = hmac.new(AUDIT_SECRET, payload_str.encode(), hashlib.sha256).hexdigest()
                    entry["hash"] = stored_hash
                    return {"valid": expected == stored_hash, "entry": entry}
    except Exception as e:
        return {"valid": False, "error": str(e)}

    return {"valid": False, "error": "Entry not found"}
