# KORE API — Current State

## Mission
13 universal infrastructure services for AI agents. Pay-per-use billing via Stripe. Revenue-ready.

## Current Focus
Memory service implementation — typed, governed, auditable cross-agent memory.

## Done
- ✅ Railway deployment live with 13 services
- ✅ Stripe LIVE with 7 products (€9-€399 + subscriptions)
- ✅ First revenue: €9 completed
- ✅ Smithery listing: `amonmaly-33/kore-api`
- ✅ MCP Registry: PR #1409
- ✅ Discovery: 5 well-known endpoints
- ✅ Auth: x-api-key + registered keys
- ✅ Billing: Hybrid model (free + packs + PAYG + Free-Limit-Trap)
- ✅ Memory service wired (6 files in kore-api/routes/memory/)

## In Progress
- 🔄 Memory service needs real DB dependency wired
- 🔄 `/.well-known/agent.json` needs deploy with 13 skills
- 🔄 Railway deploy building (auth fix + memory + discovery)

## Blocked
- Need Postgres DB instance (for memory persistence + release certs)
- Need Alembic `down_revision` from production migration graph

## Next 3 Tasks
1. Wire `get_db_session()` to real async SQLAlchemy dependency
2. Hook Verifier → structured memory writes after harness runs
3. Add `artifact/release_cert` writes on DONE verdict

## Active Decisions
- Native Postgres/JSONB first, semantic retrieval later
- Memanto as optional external backend
- Hybrid billing: free + packs + PAYG
- 10 typed memory types (fact, decision, instruction, goal, artifact, error, context, event, risk, pattern)

## Active Branch
`master`

## Last Successful Run/Cert
- Health: 🟢
- Services: 13/13
- Revenue: €9 (first purchase)

## Open Risks
- Memory service needs DB before it can persist
- Agent card needs deploy to show 13 skills
- Railway deploy occasionally hits 413 (large file uploads)
