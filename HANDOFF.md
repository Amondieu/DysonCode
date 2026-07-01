# KORE API — Handoff Document

## Live URL
`https://triumphant-enthusiasm-production-625b.up.railway.app`

## Status: Revenue-Ready 🟢

### What's Live
- **13 API services** on Railway (guard, compress, memory, route, normalize, score, split, diff, provenance, embed, sandbox, verify, audit)
- **Stripe LIVE** with 7 products (€9-€399 + €29-€79/mo subscriptions)
- **37 Infisical secrets** synced
- **First revenue:** €9 completed
- **Auth:** x-api-key header + registered API keys from `/v1/register`
- **Billing:** Hybrid model (free + credit packs + PAYG + Free-Limit-Trap)

### Discovery
| Endpoint | Protocol |
|----------|----------|
| `/.well-known/agent.json` | A2A agent card |
| `/.well-known/ai-plugin.json` | OpenAI plugin discovery |
| `/.well-known/mcp.json` | MCP ecosystem manifest |
| `/.well-known/skills.md` | Human-readable skills |
| `/.well-known/mcp/server-card.json` | MCP server card |

### Distribution
- **Smithery:** `amonmaly-33/kore-api`
- **MCP Registry:** PR #1409 at modelcontextprotocol/registry
- **awesome-mcp-servers:** Fork ready at Amondieu/awesome-mcp-servers

### Architecture Plans (`plans/`)
| File | Purpose |
|------|---------|
| `dyson-swarm-agent-architecture.md` | 12-role Dyson Swarm blueprint |
| `kore-rag-api-spec.md` | Governed RAG endpoint spec |
| `kore-memory-schema.md` | Typed memory schema |
| `dysoncode-complete-roadmap.md` | Project roadmap |

### Memory Service (`kore-api/routes/memory/`)
| File | Purpose |
|------|---------|
| `router.py` | 4 endpoints (remember, recall, as-of, conflicts) |
| `service.py` | Business rules + validation |
| `repository.py` | Postgres/JSONB persistence |
| `alembic_revision.py` | Migration template |
| `schema.sql` | Postgres table DDL |

### Key Commands
```bash
# Deploy
cd kore-api && railway up --detach

# Register agent
curl -X POST https://.../v1/register

# Buy credits
curl -H "x-api-key: YOUR_KEY" https://.../buy/starter

# Buy link (direct Stripe)
https://buy.stripe.com/eVq7sLfzygHr7zt8fu2Fa01
```

### Next Phase
1. Wire DB dependency into memory router
2. Hook Verifier → structured memory writes
3. Add release cert artifacts
4. awesome-mcp-servers PR (1 click)
