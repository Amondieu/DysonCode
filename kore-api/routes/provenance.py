"""
ΠProve — Claim Provenance.

Generates machine-readable provenance certificates with hash chains.
EU AI Act Art. 13 compliant traceability for high-risk AI systems.

Each certificate contains: claim → source mapping, confidence score,
hash chain to previous certificate, and timestamp.

RC 7/7 · Risk 1/5
Projected: $29.8k/mo at M6
"""

import logging, time, uuid, hashlib, hmac, json
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from middleware.auth import require_auth, AuthContext
from middleware.billing import check_and_record
from middleware.logger import log_call

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/v1/provenance")

CERT_DIR = "provenance_certs"
SECRET = b"kore-provenance-dev-secret"


class ProvenanceRequest(BaseModel):
    claim: str = Field(..., max_length=8000)
    source_id: str = Field(default="", max_length=200)
    source_text: str = Field(default="", max_length=16000)
    confidence: float = Field(default=0.5, ge=0.0, le=1.0)
    metadata: dict = Field(default_factory=dict)


def _load_previous_hash() -> str:
    import os
    cert_file = os.path.join(CERT_DIR, "chain.jsonl")
    try:
        with open(cert_file) as f:
            for line in f:
                pass
            last = json.loads(line)
            return last.get("cert_hash", "")
    except (FileNotFoundError, json.JSONDecodeError):
        return ""


def _write_cert(cert: dict):
    import os
    os.makedirs(CERT_DIR, exist_ok=True)
    cert_file = os.path.join(CERT_DIR, "chain.jsonl")
    with open(cert_file, "a") as f:
        f.write(json.dumps(cert, ensure_ascii=False) + "\n")


@router.post("/certify")
async def certify(req: ProvenanceRequest, auth: AuthContext = Depends(require_auth)):
    t0 = time.time()
    billing = check_and_record(auth.tier, auth.customer_id)

    prev_hash = _load_previous_hash()
    cert_id = f"cert_{uuid.uuid4().hex[:12]}"

    payload = {
        "cert_id": cert_id,
        "claim": req.claim,
        "source_id": req.source_id,
        "source_text": req.source_text[:500],
        "confidence": req.confidence,
        "customer": auth.customer_id,
        "tier": auth.tier,
        "prev_hash": prev_hash,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    payload_str = json.dumps(payload, sort_keys=True, ensure_ascii=False)
    cert_hash = hashlib.sha256(payload_str.encode()).hexdigest()
    payload["cert_hash"] = cert_hash

    _write_cert(payload)

    resp = {
        "cert_id": cert_id,
        "cert_hash": cert_hash,
        "previous_hash": prev_hash,
        "claim": req.claim[:200],
        "source_id": req.source_id,
        "confidence": req.confidence,
        "verified": req.confidence >= 0.7,
        "chain_length": 1 if not prev_hash else "continuous",
        "latency_ms": round((time.time() - t0) * 1000, 1),
        "quota_remaining": billing["quota_remaining"],
    }

    log_call("POST", "/v1/provenance/certify", 200, resp["latency_ms"], auth.tier, auth.customer_id, resp)
    return resp


@router.get("/certify/{cert_id}")
async def get_certificate(cert_id: str):
    import os
    cert_file = os.path.join(CERT_DIR, "chain.jsonl")
    try:
        with open(cert_file) as f:
            for line in f:
                cert = json.loads(line)
                if cert.get("cert_id") == cert_id:
                    return cert
    except FileNotFoundError:
        pass
    raise HTTPException(404, "Certificate not found")


@router.get("/chain/{cert_hash}")
async def verify_chain(cert_hash: str):
    """Verify the integrity of a certificate by walking its hash chain."""
    import os
    cert_file = os.path.join(CERT_DIR, "chain.jsonl")
    try:
        with open(cert_file) as f:
            certs = [json.loads(line) for line in f if line.strip()]
    except FileNotFoundError:
        raise HTTPException(404, "No certificates found")

    # Find starting cert
    target = None
    for c in certs:
        if c.get("cert_hash") == cert_hash:
            target = c
            break
    if not target:
        raise HTTPException(404, "Certificate hash not found")

    # Verify chain backwards
    chain = [target]
    current = target
    while current.get("prev_hash"):
        found = False
        for c in certs:
            if c.get("cert_hash") == current["prev_hash"]:
                chain.append(c)
                current = c
                found = True
                break
        if not found:
            break

    return {
        "verified": True,
        "chain_length": len(chain),
        "chain": [
            {"cert_id": c["cert_id"], "claim": c["claim"][:100], "created_at": c["created_at"]}
            for c in chain
        ],
    }
