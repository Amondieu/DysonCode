# AGENTS.md — KORE Handoff Protocol

## Mandatory Startup Protocol

Before doing **any** work, every agent **must**:

1. **Read** [`KORE_STATE.md`](KORE_STATE.md) — mission, current focus, done/in_progress/blocked
2. **Read** [`.kore-memory/current-work.json`](.kore-memory/current-work.json) — machine-readable state snapshot
3. **Read** the last **3 entries** of [`.kore-memory/handoffs.jsonl`](.kore-memory/handoffs.jsonl) — what was just worked on
4. **Check** [`.kore-memory/blockers.jsonl`](.kore-memory/blockers.jsonl) before spending time on something already blocked
5. **Check** [`.kore-memory/decisions.jsonl`](.kore-memory/decisions.jsonl) before making new architectural decisions

**Quick command:**
```bash
make handoff-start
```

---

## Mandatory Shutdown Protocol

After finishing **any** session, every agent **must**:

1. **Append** a handoff entry to [`.kore-memory/handoffs.jsonl`](.kore-memory/handoffs.jsonl)
2. **Update** [`.kore-memory/current-work.json`](.kore-memory/current-work.json)
3. **Update** [`KORE_STATE.md`](KORE_STATE.md) if status changed
4. **Log** new decisions to [`.kore-memory/decisions.jsonl`](.kore-memory/decisions.jsonl)
5. **Log** new blockers to [`.kore-memory/blockers.jsonl`](.kore-memory/blockers.jsonl)

**Quick command:**
```bash
make handoff-end
```

---

## Enforcement Policy

> **No agent starts coding before reading the repo handoff state, and no agent finishes coding before writing a new handoff.**

- If code changed and handoff state is stale, the next agent will detect drift
- This repo uses a **two-layer memory system**:
  - **Repo truth** (git): these handoff files — transparent, reviewable, immutable
  - **API truth** (KORE memory API): indexed retrieval across sessions

---

## File Overview

| File | Purpose | Format |
|------|---------|--------|
| [`KORE_STATE.md`](KORE_STATE.md) | Human-readable canonical state | Markdown |
| [`.kore-memory/current-work.json`](.kore-memory/current-work.json) | Machine-readable state snapshot | JSON |
| [`.kore-memory/handoffs.jsonl`](.kore-memory/handoffs.jsonl) | Append-only session stream | JSONL |
| [`.kore-memory/decisions.jsonl`](.kore-memory/decisions.jsonl) | Append-only ADR-lite stream | JSONL |
| [`.kore-memory/blockers.jsonl`](.kore-memory/blockers.jsonl) | Unresolved issues log | JSONL |
| [`.kore-memory/HANDOFF_PROTOCOL.md`](.kore-memory/HANDOFF_PROTOCOL.md) | Full protocol documentation | Markdown |

---

## Context

This is the **KORE API** monorepo — 13 universal infrastructure services for AI agents, pay-per-use billing via Stripe, deployed on Railway.

- Live: `https://kore-api.up.railway.app`
- Smithery: `amonmaly-33/kore-api`
- Revenue: **€9** (first purchase, LIVE Stripe)
