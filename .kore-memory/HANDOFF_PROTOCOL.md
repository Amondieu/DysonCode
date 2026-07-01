# KORE Handoff Protocol

## Rule

**No agent starts coding before reading the repo handoff state, and no agent finishes coding before writing a new handoff.**

This single constraint prevents drift, duplicate work, and lost context across IDEs and agent sessions.

## Files

| File | Purpose | Format |
|------|---------|--------|
| [`KORE_STATE.md`](../KORE_STATE.md) | Human-readable canonical state | Markdown |
| [`current-work.json`](current-work.json) | Machine-readable state snapshot | JSON |
| [`handoffs.jsonl`](handoffs.jsonl) | Append-only session stream | JSONL |
| [`decisions.jsonl`](decisions.jsonl) | Append-only ADR-lite stream | JSONL |
| [`blockers.jsonl`](blockers.jsonl) | Unresolved issues log | JSONL |

## Session Start

Every agent **must** run:

```bash
make handoff-start
```

This reads and prints:
- `KORE_STATE.md` — mission, current focus, done/in_progress/blocked
- `current-work.json` — machine state (live URL, revenue, services)
- Last 3 lines of `handoffs.jsonl` — what was just worked on
- Recent git commits

## During Work

Reference `decisions.jsonl` to check prior architectural decisions before making new ones.

Reference `blockers.jsonl` before spending time on something that's already blocked.

## Session End

Every agent **must** run:

```bash
make handoff-end
```

This interactively collects:
- What was completed
- What's still in progress
- Any blockers
- Next steps
- Decisions made

Then automatically:
1. Appends to `handoffs.jsonl`
2. Updates `current-work.json`
3. Appends new decisions to `decisions.jsonl`
4. Appends new blockers to `blockers.jsonl`
5. Prints a continuation prompt for the next agent

## Optional: Sync to KORE API

```bash
make handoff-sync KORE_API_KEY=<your-key>
```

Mirrors the latest handoff state into the KORE memory API as a `context` entry for cross-run retrieval.

## Enforcement

- If code changed and handoff state is stale, the next agent will detect drift
- CI can check: if `git diff --name-only HEAD~1` has non-handoff files, then handoff must have been updated
- Two-layer system: repo truth (git) + API truth (KORE memory)

## File Format: handoffs.jsonl

Each line is a JSON object:

```json
{
  "handoff_id": "handoff_2026-07-01T20-30-00Z_master",
  "repo": "kore-api",
  "agent_tool": "KORE",
  "branch": "master",
  "timestamp": "2026-07-01T20:30:00Z",
  "completed": ["Finished X", "Deployed Y"],
  "in_progress": ["Working on Z"],
  "blocked": ["Need Postgres DB"],
  "next_steps": ["Wire DB dependency", "Hook Verifier"],
  "decisions": ["Use Postgres/JSONB first"],
  "files_touched": ["src/main.py", "routes/memory/router.py"]
}
```

## File Format: decisions.jsonl

```json
{
  "decision_id": "dec_2026-07-01T20-30-00Z_0001",
  "timestamp": "2026-07-01T20:30:00Z",
  "decision": "Use Postgres/JSONB first for memory",
  "handoff_id": "handoff_...",
  "status": "active"
}
```

Status values: `active`, `superseded`, `rejected`

## File Format: blockers.jsonl

```json
{
  "blocker_id": "blk_2026-07-01T20-30-00Z_0001",
  "timestamp": "2026-07-01T20:30:00Z",
  "blocker": "Need Postgres DB instance",
  "handoff_id": "handoff_...",
  "status": "open"
}
```

Status values: `open`, `resolved`, `wontfix`
