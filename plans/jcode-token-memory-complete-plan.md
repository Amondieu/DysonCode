# JCODE Token Optimization + Memory + Protocol — Complete Implementation Plan

## 2026-06-26 | Dyson Sphere Space

---

## FIELD COLLAPSE

The two review documents in `JcodeChatPlans/TokenOptimization/` identify **10 blind spots and additions** in jcode v2.0. Our Electron wrapper (`DysonCode`) has already implemented **2 of the 5 core memory pieces** (SessionSummary, MemoryBridge). This plan covers **everything** that remains, organized by leverage.

---

## PART 0 — AUDIT: What Already Exists

### ✅ Delivered

| File | What it does |
|---|---|
| [`src/main/session-summary.ts`](src/main/session-summary.ts) | SessionSummary struct with save/load, decision extraction, file path extraction, `asContextSection()` for prompt injection |
| [`src/main/memory-bridge.ts`](src/main/memory-bridge.ts) | Electron MemoryBridge singleton — persists window state, mode, UI prefs, token stats between launches |
| [`src/main/jcode-client.ts`](src/main/jcode-client.ts) | `--resume` session tracking, `activeCwd` persistence, `SessionSummary.save()` called on `proc.on('close')` |
| LiteLLM proxy | Running on `:4000` with `flash-k2` (→ DeepSeek) and `deepseek-chat` models |

### ❌ Not Yet Delivered

| Item | Source | Why it's missing |
|---|---|---|
| HeadroomBar React component | ZooCode Part 4 | Not yet created as a .tsx file |
| Compression quality gate | BS1 in review | Requires post-compression decision verification |
| Cross-session routing corrections | BS2 in review | Requires `~/.jcode/routing_corrections.jsonl` |
| Semantic deduplication | A1 in review | Requires embedding model integration |
| Turn-level cost attribution | A2 in review | Requires reference scoring against context layers |
| Streaming abort with partial commit | A3 in review | Escape handler doesn't commit partial content |
| Mode-aware prompt templates | A4 in review | All modes use same prompt structure |
| Provider health check | BS5 in review | No check before mode switch |
| AUDIT mode single-pass | BS3 in review | No enforcement mechanism |
| RC7 provider adapter | BS6 in review | Future architecture, not yet needed |
| Diff anchoring fix | BS4 in review | Git utility, low priority for initial integration |

---

## PART 1 — IMMEDIATE (Same Session)

These are the highest-leverage, lowest-cost items. Implement next.

### 1.1 — Compression Quality Gate (BS1)

**File:** [`src/main/session-summary.ts`](src/main/session-summary.ts) — already has `extractDecisions()`

**Change:** Add `compressWithVerify()` method:

```typescript
compressWithVerify(turns: string[], targetTokens: number): string {
  const compressed = this.callCompression(turns, targetTokens);
  const decisions = SessionSummary.extractDecisions(turns);
  const missing = decisions.filter(d => !compressed.toLowerCase().includes(d.toLowerCase()));
  if (missing.length > 0) {
    // Retry with must-preserve list
    return this.callCompression(turns, targetTokens, missing);
  }
  return compressed;
}
```

**Why it matters:** Without this, a Qwen 0.5B compression can silently drop "we chose git diff --cached" and the next session won't know. This adds ~50 tokens of verification cost and prevents catastrophic context drift.

**Cost:** ~50 tokens per compression | **Gain:** Prevents silent context drift

---

### 1.2 — Streaming Abort with Partial Commit (A3)

**File:** [`src/renderer/components/ChatPanel/useChatIpc.ts`](src/renderer/components/ChatPanel/useChatIpc.ts)

**Change:** In the `cancel()` function, append `[ABORTED at N tokens]` to the partial message instead of discarding it.

Current:
```typescript
const cancel = useCallback(() => {
  if (api.send) api.send('jcode:cancel-stream');
}, [api]);
```

After:
```typescript
const cancel = useCallback(() => {
  if (api.send) {
    api.send('jcode:cancel-stream');
    dispatch({ type: 'TOKEN', id: currentMsgId, token: '\n\n[ABORTED]' });
    dispatch({ type: 'MSG_END', id: currentMsgId });
  }
}, [api, currentMsgId]);
```

**Why it matters:** A 400-token partial response aborted at token 200 still contains 200 tokens of useful reasoning. Discarding it forces regeneration. Committing with `[ABORTED]` lets the next turn build on it.

**Cost:** 0 additional tokens | **Gain:** Preserves partial reasoning on abort

---

### 1.3 — HeadroomBar React Component (ZooCode Part 4)

**File:** [`src/renderer/components/ChatPanel/HeadroomBar.tsx`](src/renderer/components/ChatPanel/HeadroomBar.tsx) (new)

```typescript
interface HeadroomBarProps {
  used: number;
  total: number;
  mode: string;
}
```

Color thresholds: green < 70%, gold < 90%, red ≥ 90%. Width 80px, height 6px. Tooltip shows `{used.toLocaleString()} / {total.toLocaleString()} tokens ({mode})`.

Wire into [`ChatPanel.tsx`](src/renderer/components/ChatPanel/ChatPanel.tsx) above the input area, sourcing `used` from a token counter tracking streamed tokens.

**Why it matters:** Without visual feedback, users don't know how close they are to the context limit. The HeadroomBar makes token budget visible at a glance.

**Cost:** ~0 tokens (UI only) | **Gain:** Visibility into context budget

---

## PART 2 — SHORT-TERM (Next Session)

### 2.1 — Cross-Session Routing Corrections (BS2)

**File:** [`src/main/session-summary.ts`](src/main/session-summary.ts)

**Add:** Routing corrections persistence at `~/.jcode/routing_corrections.jsonl`

```typescript
// In session-summary.ts
export function logRoutingCorrection(originalIntent: string, suggested: string, chosen: string): void {
  const p = path.join(os.homedir(), '.jcode', 'routing_corrections.jsonl');
  const entry = JSON.stringify({ ts: new Date().toISOString(), intent: originalIntent, suggested, chosen }) + '\n';
  fs.appendFileSync(p, entry, 'utf-8');
}

export function buildUserRoutingOverrides(): Record<string, string> {
  // After 10 corrections, derive keyword → mode mappings
  // e.g., if "deploy" always maps to "stealth", add that override
}
```

**File:** [`src/renderer/components/ChatPanel/ChatPanel.tsx`](src/renderer/components/ChatPanel/ChatPanel.tsx)

**Add:** Mode selector dropdown above the input. On mode change, call `logRoutingCorrection()` with the original auto-detected mode vs selected mode. Expose autocomplete chips based on `buildUserRoutingOverrides()`.

**Why it matters:** Without this, a user who manually overrides the router on turn 3 of every 8-turn session never gets routing profile updates. The feedback loop requires within-session accumulation but most usage is multi-session.

**Cost:** ~0 tokens | **Gain:** Self-improving router without explicit training

---

### 2.2 — Mode-Aware Prompt Templates (A4)

**File:** [`src/main/jcode-client.ts`](src/main/jcode-client.ts)

**Add:** Mode-specific prompt wrappers in the spawn args or system prompt injection:

```typescript
const MODE_PROMPTS: Record<string, string> = {
  fast: 'Answer directly: ',
  balanced: '', // standard prompt
  deep: 'Reason step by step. State the tension first: ',
  audit: 'Complete every section of the audit schema. Section by section: ',
  inventor: 'Generate 3 invention candidates. Each must resolve a tension: ',
};
```

Prepend the appropriate template to the message before passing to jcode. This costs zero tokens (it's just restructuring) and significantly improves output quality per mode.

**Why it matters:** v2.0 defines response length budgets per mode but not different prompt structures. FAST with "Answer directly:" produces a fundamentally different output than FAST with the standard prompt, even at the same length budget.

**Cost:** 0 tokens (prompt restructuring) | **Gain:** Structural output differentiation per mode

---

## PART 3 — MEDIUM-TERM (Cross-Session)

### 3.1 — Semantic Deduplication (A1)

**File:** [`src/main/session-summary.ts`](src/main/session-summary.ts)

**Add:** Embedding-based similarity check using nomic-embed-text (384-dim vectors via Ollama). Before assembling context, run:

```typescript
async function deduplicateContext(items: string[], threshold = 0.92): Promise<string[]> {
  if (items.length <= 1) return items;
  const embeddings = await Promise.all(items.map(item => getEmbedding(item)));
  const keep = [0];
  for (let i = 1; i < items.length; i++) {
    const sims = keep.map(j => cosineSimilarity(embeddings[i], embeddings[j]));
    if (Math.max(...sims) < threshold) keep.push(i);
  }
  return keep.map(i => items[i]);
}
```

**Prerequisite:** Ollama running locally with `nomic-embed-text` model pulled.

**Why it matters:** Conversations naturally repeat "the manifest has K=1.3354" 4 times. Deduplication removes this silently. Expected additional savings: 10-20% on top of compression.

**Cost:** ~5ms per turn (local embedding) | **Gain:** +10-20% token savings

---

### 3.2 — Turn-Level Cost Attribution (A2)

**File:** [`src/main/session-summary.ts`](src/main/session-summary.ts)

**Add:** After each turn, score which context layer was referenced vs ignored:

```typescript
function scoreLayerUtility(layerContent: string, response: string): number {
  const words = new Set(layerContent.toLowerCase().split(/\s+/));
  const responseWords = new Set(response.toLowerCase().split(/\s+/));
  const referenced = [...words].filter(w => responseWords.has(w));
  if (words.size === 0) return 0;
  return referenced.length / words.size;
}
```

Surface after 20 turns: "Your DEEP mode episodic buffer has 0.08 utility — 92% of its tokens are never referenced."

**Why it matters:** The current architecture tells you total cost but not which layer is the primary driver. Without attribution, optimization is blind.

**Cost:** ~0 tokens (local computation) | **Gain:** Optimization visibility

---

### 3.3 — Local Provider Health Check (BS5)

**File:** [`src/main/ipc-handlers.ts`](src/main/ipc-handlers.ts)

**Add:** IPC handler `jcode:check-provider` that hits the LiteLLM health endpoint before allowing a mode switch. If `flash-k2` is unreachable, return a user-visible error explaining *which* model is missing and *how* to fix it.

**Why it matters:** If LiteLLM is down and the user switches to a mode that requires it, the system silently fails or returns garbage.

**Cost:** ~0 tokens | **Gain:** Graceful degradation on provider failure

---

### 3.4 — AUDIT Mode Single-Pass Enforcement (BS3)

**File:** [`src/main/jcode-client.ts`](src/main/jcode-client.ts)

**Add:** Mode configuration with `sessionType: 'single_pass'` for AUDIT. If a user tries to start a second audit domain in the same session, emit a warning and block: "AUDIT mode is single-pass. Start a new session for [domain]."

**Why it matters:** An AUDIT session running 4-6 passes will fill its 64K budget and crash, silently producing a partial audit.

**Cost:** ~0 tokens | **Gain:** Prevents silent partial audits

---

## PART 4 — ARCHITECTURE (Future RC7)

### 4.1 — Provider Adapter Pattern (BS6)

Not needed until we add a second provider (e.g., Ollama for STEALTH mode). When that happens, implement:

```typescript
interface ModelProvider {
  chat(messages: Message[], maxTokens: number, temperature: number, stream: boolean): AsyncIterable<string>;
  countTokens(text: string): number;
  supportsPrefixCache(): boolean;
  healthCheck(): { available: boolean; latencyMs: number };
}
```

Currently we only have LiteLLM → DeepSeek, so the provider abstraction is premature. File under "when needed."

### 4.2 — Diff Anchoring Fix (BS4)

Git utility for `git diff HEAD -- <file>`. Low priority — only matters when jcode needs to reference unstaged+staged diffs simultaneously, which our current tool bridge doesn't do.

---

## IMPLEMENTATION ORDER

```
Phase 1 (This session):  1.1 Compression gate → 1.2 Abort commit → 1.3 HeadroomBar
Phase 2 (Next session):  2.1 Routing corrections → 2.2 Mode prompts
Phase 3 (Cross-session): 3.1 Deduplication → 3.2 Cost attribution
Phase 4 (Polish):        3.3 Health check → 3.4 Audit enforcement
Phase 5 (Future):        4.1 Provider adapter → 4.2 Diff fix
```

---

## TOKEN BUDGET ANALYSIS

| Feature | Token Cost | Token Savings | Net |
|---------|-----------|---------------|-----|
| SessionSummary injection | 150-400 per session open | 300-800 per session (re-establ. turns) | -150 to -400 |
| Compression gate (BS1) | ~50 per compression | Prevents full context drift | Infinite |
| Deduplication (A1) | ~5ms compute per turn | 10-20% of context | Significant |
| Abort commit (A3) | 0 | 200+ per abort event | Positive |
| Everything else | ~0 | Structural, not token | N/A |
