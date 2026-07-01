"""create memory_entries table

Revision ID: 20260701_kore_memory_entries
Revises: 
Create Date: 2026-07-01 20:23:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260701_kore_memory_entries"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "memory_entries",
        sa.Column("memory_id", sa.Text(), primary_key=True),
        sa.Column("agent_id", sa.Text(), nullable=False),
        sa.Column("tenant_id", sa.Text(), nullable=False),
        sa.Column("project_id", sa.Text(), nullable=False),
        sa.Column("repo_id", sa.Text(), nullable=False),
        sa.Column("environment", sa.Text(), nullable=False),
        sa.Column("type", sa.Text(), nullable=False),
        sa.Column("subtype", sa.Text(), nullable=True),
        sa.Column("status", sa.Text(), nullable=False),
        sa.Column("knowledge_class", sa.Text(), nullable=False),
        sa.Column("pattern_role", sa.Text(), nullable=False),
        sa.Column("scope_level", sa.Text(), nullable=False),
        sa.Column("scope_id", sa.Text(), nullable=False),
        sa.Column("branch", sa.Text(), nullable=True),
        sa.Column("pr_number", sa.Integer(), nullable=True),
        sa.Column("observed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("effective_from", sa.DateTime(timezone=True), nullable=False),
        sa.Column("effective_to", sa.DateTime(timezone=True), nullable=True),
        sa.Column("trace_id", sa.Text(), nullable=False),
        sa.Column("run_id", sa.Text(), nullable=False),
        sa.Column("session_id", sa.Text(), nullable=False),
        sa.Column("tags", postgresql.ARRAY(sa.Text()), nullable=False, server_default="{}"),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
    )

    op.create_index(
        "idx_memory_agent_scope",
        "memory_entries",
        ["agent_id", "scope_level", "scope_id"],
        unique=False,
    )
    op.create_index(
        "idx_memory_type",
        "memory_entries",
        ["type", "subtype"],
        unique=False,
    )
    op.create_index(
        "idx_memory_recorded_at",
        "memory_entries",
        [sa.text("recorded_at DESC")],
        unique=False,
    )
    op.create_index(
        "idx_memory_tags_gin",
        "memory_entries",
        ["tags"],
        unique=False,
        postgresql_using="gin",
    )
    op.create_index(
        "idx_memory_payload_gin",
        "memory_entries",
        ["payload"],
        unique=False,
        postgresql_using="gin",
        postgresql_ops={"payload": "jsonb_path_ops"},
    )


def downgrade() -> None:
    op.drop_index("idx_memory_payload_gin", table_name="memory_entries")
    op.drop_index("idx_memory_tags_gin", table_name="memory_entries")
    op.drop_index("idx_memory_recorded_at", table_name="memory_entries")
    op.drop_index("idx_memory_type", table_name="memory_entries")
    op.drop_index("idx_memory_agent_scope", table_name="memory_entries")
    op.drop_table("memory_entries")
