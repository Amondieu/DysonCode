# KORE API — Skills & Capabilities

## Overview
13 universal infrastructure services for AI agents. Pay-per-use billing via Stripe. Free API key at `/v1/register`.

**Base URL:** `https://triumphant-enthusiasm-production-625b.up.railway.app`
**Auth:** `x-api-key` header
**Pricing:** €9 (Starter) / €35 (Builder) / €99 (Scale) / €399 (Enterprise)

---

## Core Services

### 🛡️ Guard — Hallucination Firewall
Check AI output against source documents. Flags unsupported claims before agent output emission.
- `POST /v1/guard` — €0.004/call

### 📦 Compress — Context Compression
3-5x semantic compression without quality loss. Reduces token costs.
- `POST /v1/compress` — €0.003/call
- **3 free calls/day**

### 🧠 Memory — Cross-Agent Memory
Shared Qdrant-backed memory across all agents. Network effect compounds.
- `POST /v1/memory/write` — €0.002/write
- `POST /v1/memory/recall` — €0.001/recall

### 🔄 Route — Token Cost Arbitrage
Routes to cheapest adequate LLM from 11-provider fallback chain.
- `POST /v1/route` — €0.005/call
- **3 free calls/day**

### 🧹 Normalize — Prompt Normalizer
Detect injections, normalize whitespace, strip noise.
- `POST /v1/normalize` — €0.001/call

### ⭐ Score — Quality Scorer
Rank multiple candidate outputs by heuristic quality.
- `POST /v1/score` — €0.04/call

### ✂️ Split — Task Decomposer
Break complex tasks into parallel subtasks.
- `POST /v1/split` — €0.005/call

### 🔍 Diff — Semantic Diff Engine
Meaning-preserving diff between text outputs.
- `POST /v1/diff` — €0.005/call

### 📜 Provenance — Claim Certification
EU AI Act compliant HMAC-SHA256 provenance certificates.
- `POST /v1/provenance/certify` — €0.01/certify

### 💾 Embed — Embedding Cache
LRU-cached all-MiniLM embeddings. Zero recomputation.
- `POST /v1/embed` — €0.001/call

### 🏖️ Sandbox — Agent Sandbox
Safe Python execution. 30s timeout. No Docker needed.
- `POST /v1/sandbox/exec` — €0.005/exec

### 📋 Verify — Compliance Verification
Answer verification against source documents.
- `POST /v1/compliance/verify` — €0.072/call

### 📋 Audit — Immutable Audit Log
HMAC-SHA256 chained trail. EU AI Act compliant.
- `GET /v1/audit/trail` — Free

---

## Premium Services

### 🧪 Lab Simulation — Full Domino Chain
compress → route → score×5 → verify in one call.
- `POST /v1/lab/simulate/full` — **€1.28/run**

---

## Getting Started

```bash
# 1. Get your free API key
curl -X POST https://.../v1/register

# 2. Test with a free call
curl -X POST https://.../v1/compress \
  -H "x-api-key: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello KORE!"}'

# 3. Buy credits
curl -H "x-api-key: YOUR_KEY" https://.../buy/starter
```

## Discovery Endpoints
- `/.well-known/agent.json` — A2A agent card
- `/.well-known/ai-plugin.json` — OpenAI plugin discovery
- `/.well-known/mcp.json` — MCP ecosystem manifest
- `/.well-known/mcp/server-card.json` — MCP server card
- `/v1/services` — Full service catalog
- `/trust-card` — Live trust metrics
