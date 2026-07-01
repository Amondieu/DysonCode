CREATE TABLE IF NOT EXISTS memory_entries (
    memory_id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    tenant_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    repo_id TEXT NOT NULL,
    environment TEXT NOT NULL,
    type TEXT NOT NULL,
    subtype TEXT NULL,
    status TEXT NOT NULL,
    knowledge_class TEXT NOT NULL,
    pattern_role TEXT NOT NULL,
    scope_level TEXT NOT NULL,
    scope_id TEXT NOT NULL,
    branch TEXT NULL,
    pr_number INTEGER NULL,
    observed_at TIMESTAMPTZ NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL,
    effective_from TIMESTAMPTZ NOT NULL,
    effective_to TIMESTAMPTZ NULL,
    trace_id TEXT NOT NULL,
    run_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    tags TEXT[] NOT NULL DEFAULT '{}',
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_memory_agent_scope
    ON memory_entries (agent_id, scope_level, scope_id);

CREATE INDEX IF NOT EXISTS idx_memory_type
    ON memory_entries (type, subtype);

CREATE INDEX IF NOT EXISTS idx_memory_recorded_at
    ON memory_entries (recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_memory_tags_gin
    ON memory_entries USING GIN (tags);

CREATE INDEX IF NOT EXISTS idx_memory_payload_gin
    ON memory_entries USING GIN (payload jsonb_path_ops);
