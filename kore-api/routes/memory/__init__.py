"""
KORE Memory Service — typed, governed, auditable cross-agent memory.

Endpoints:
  POST /v1/memory/remember   — write typed memories
  POST /v1/memory/recall     — scoped recall by type/scope/knowledge class
  POST /v1/memory/recall/as-of — temporal recall
  POST /v1/memory/conflicts   — detect contradictions

Requires: x-api-key header
Database: Postgres/JSONB (see schema.sql)
Optional backend: Memanto adapter
"""
from .router import router as memory_router
