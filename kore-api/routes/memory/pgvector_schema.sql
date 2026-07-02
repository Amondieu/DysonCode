-- KORE Memory Layer: Postgres + pgvector schema
-- Run against your Railway Postgres instance.
-- Requires pgvector extension: CREATE EXTENSION vector;

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS memories (
    id              BIGSERIAL PRIMARY KEY,
    created_at      TIMESTAMPTZ    NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ    NOT NULL DEFAULT now(),

    -- Core content
    text            TEXT           NOT NULL,
    embedding       VECTOR(1536)   NOT NULL,

    -- Context scoping
    agent_id        TEXT           NOT NULL,
    session_id      TEXT           NULL,
    user_id         TEXT           NULL,

    -- Metadata for filtering
    labels          TEXT[]         NULL,
    importance      REAL           NOT NULL DEFAULT 0.5,
    expires_at      TIMESTAMPTZ    NULL,

    -- Provenance
    source_type     TEXT           NOT NULL DEFAULT 'tool_output',
    source_id       TEXT           NULL,
    trace_id        TEXT           NULL
);

-- Index for cosine similarity search
-- (lists = 100 is reasonable for ~100K rows; adjust up for larger datasets)
CREATE INDEX IF NOT EXISTS memories_embedding_idx
    ON memories USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

-- Indexes for scoped recall
CREATE INDEX IF NOT EXISTS memories_agent_session_idx
    ON memories (agent_id, session_id);

CREATE INDEX IF NOT EXISTS memories_labels_idx
    ON memories USING GIN (labels);

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER memories_updated_at
    BEFORE UPDATE ON memories
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
