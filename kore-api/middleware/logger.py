"""
JSONL request logger — feeds KORE dataset pipeline.

Writes every API call to logs/api_calls.jsonl for:
  - Trust card metrics (latency, scores)
  - Dataset export
  - Quality drift monitoring
"""

import json, os, logging
from datetime import datetime, timezone
from pathlib import Path

LOG_DIR = os.environ.get("API_LOG_DIR", "logs")
LOG_FILE = os.path.join(LOG_DIR, "api_calls.jsonl")


def log_call(method: str, path: str, status: int, duration_ms: float,
             tier: str = "free", customer_id: str = "anon",
             response: dict = None):
    os.makedirs(LOG_DIR, exist_ok=True)
    entry = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "method": method,
        "path": path,
        "status": status,
        "duration_ms": round(duration_ms, 1),
        "tier": tier,
        "customer": customer_id,
    }
    if response:
        entry["verification_score"] = response.get("verification_score")
        entry["grounded"] = response.get("grounded")
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    except Exception as e:
        logging.getLogger(__name__).warning(f"Log write failed: {e}")
