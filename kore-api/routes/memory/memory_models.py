"""
memory_models.py — Pydantic models for the KORE memory service.
"""
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field


# ── Enums ────────────────────────────────────────────────────────────────────

class MemoryType(str, Enum):
    fact = "fact"
    decision = "decision"
    instruction = "instruction"
    goal = "goal"
    artifact = "artifact"
    error = "error"
    context = "context"
    event = "event"
    risk = "risk"
    pattern = "pattern"


class MemoryStatus(str, Enum):
    active = "active"
    frozen = "frozen"
    superseded = "superseded"
    expired = "expired"


class KnowledgeClass(str, Enum):
    explicit = "explicit"
    implicit = "implicit"
    emergent = "emergent"


class PatternRole(str, Enum):
    k2_success = "k2_success"
    k3_failure = "k3_failure"
    none_proven = "none_proven"


class ScopeLevel(str, Enum):
    project = "project"
    agent = "agent"
    session = "session"
    global_ = "global"


class Environment(str, Enum):
    production = "production"
    staging = "staging"
    development = "development"
    test = "test"


# ── Nested models ────────────────────────────────────────────────────────────

class Scope(BaseModel):
    level: ScopeLevel
    scope_id: str
    branch: Optional[str] = None
    pr_number: Optional[int] = None


class TimeFrame(BaseModel):
    observed_at: Optional[datetime] = None
    recorded_at: datetime = Field(default_factory=datetime.utcnow)
    effective_from: Optional[datetime] = None
    effective_to: Optional[datetime] = None


class SourceInfo(BaseModel):
    trace_id: Optional[str] = None
    run_id: Optional[str] = None
    session_id: Optional[str] = None


class CertificationVerdict(str, Enum):
    DONE = "DONE"
    FAIL = "FAIL"
    UNCERTAIN = "UNCERTAIN"


class Certification(BaseModel):
    verifier_id: str
    verdict: CertificationVerdict
    confidence: float = Field(ge=0.0, le=1.0)
    falsifiers: list[str] = Field(default_factory=list)
    certified_at: datetime = Field(default_factory=datetime.utcnow)


# ── Main memory entry ───────────────────────────────────────────────────────

class MemoryEntry(BaseModel):
    memory_id: str
    agent_id: str
    tenant_id: Optional[str] = None
    project_id: Optional[str] = None
    repo_id: Optional[str] = None
    environment: Environment = Environment.production
    type: MemoryType
    subtype: Optional[str] = None
    status: MemoryStatus = MemoryStatus.active
    knowledge_class: KnowledgeClass = KnowledgeClass.explicit
    pattern_role: PatternRole = PatternRole.none_proven
    title: Optional[str] = None
    content: Optional[str] = None
    tags: list[str] = Field(default_factory=list)
    scope: Scope
    time: TimeFrame = Field(default_factory=TimeFrame)
    source: SourceInfo = Field(default_factory=SourceInfo)
    certification: Optional[Certification] = None
    confidence: float = 0.0


# ── Request / Response models ───────────────────────────────────────────────

class RememberRequest(BaseModel):
    agent_id: str
    entries: list[MemoryEntry]


class RememberResponse(BaseModel):
    stored: int
    ids: list[str]


class RecallRequest(BaseModel):
    agent_id: str
    query: str = ""
    scope: Optional[Scope] = None
    types: Optional[list[MemoryType]] = None
    knowledge_class: Optional[list[KnowledgeClass]] = None
    tags: Optional[list[str]] = None
    limit: int = 12


class RecallAsOfRequest(RecallRequest):
    as_of: datetime


class RecallMatch(BaseModel):
    memory: MemoryEntry
    score: float


class RecallResponse(BaseModel):
    count: int
    matches: list[RecallMatch]


class ConflictItem(BaseModel):
    left_id: str
    right_id: str
    reason: str
    confidence: float


class ConflictRequest(BaseModel):
    agent_id: str
    scope: Scope
    types: Optional[list[MemoryType]] = None


class ConflictResponse(BaseModel):
    count: int
    conflicts: list[ConflictItem]
