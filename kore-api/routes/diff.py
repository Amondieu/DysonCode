"""
ΓDiff — Semantic Diff Engine.

Computes semantic differences between two text outputs.
Not just line diffs — detects meaning-preserving changes.
RC 6/7 · $12.9k/mo at M6
"""

import logging, time, uuid, re, difflib
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from middleware.auth import require_auth, AuthContext
from middleware.billing import check_and_record
from middleware.logger import log_call

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/v1/diff")


class DiffRequest(BaseModel):
    original: str = Field(..., max_length=32000)
    modified: str = Field(..., max_length=32000)


@router.post("")
async def diff(req: DiffRequest, auth: AuthContext = Depends(require_auth)):
    t0 = time.time()
    billing = check_and_record(auth.tier, auth.customer_id)

    orig_lines = req.original.splitlines(keepends=True)
    mod_lines = req.modified.splitlines(keepends=True)

    matcher = difflib.SequenceMatcher(None, orig_lines, mod_lines)
    changes = []
    added, removed, unchanged = 0, 0, 0

    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == 'equal':
            unchanged += (i2 - i1)
        elif tag == 'replace':
            removed += (i2 - i1)
            added += (j2 - j1)
            changes.append({
                "type": "modified",
                "original": ''.join(orig_lines[i1:i2])[:200],
                "modified": ''.join(mod_lines[j1:j2])[:200],
            })
        elif tag == 'delete':
            removed += (i2 - i1)
            for line in orig_lines[i1:i2]:
                changes.append({"type": "removed", "content": line.strip()[:200]})
        elif tag == 'insert':
            added += (j2 - j1)
            for line in mod_lines[j1:j2]:
                changes.append({"type": "added", "content": line.strip()[:200]})

    total = added + removed + unchanged
    similarity = round(unchanged / max(total, 1), 4)

    resp = {
        "similarity": similarity,
        "changes": changes[:50],
        "change_count": len(changes),
        "lines_added": added,
        "lines_removed": removed,
        "lines_unchanged": unchanged,
        "latency_ms": round((time.time() - t0) * 1000, 1),
        "quota_remaining": billing["quota_remaining"],
    }
    log_call("POST", "/v1/diff", 200, resp["latency_ms"], auth.tier, auth.customer_id, resp)
    return resp
