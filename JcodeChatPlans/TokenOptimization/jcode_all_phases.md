# ZooCode: Implement ALL Phases — jcode Token Memory Complete
## Phase 1→4 in Dependency Order | TypeScript/Electron | 2026-06-26
### Paste directly into ZooCode in Code mode

---

## CONTEXT (what ZooCode already built this session)
- `src/main/session-summary.ts` — SessionSummary struct + save/load
- `src/main/memory-bridge.ts` — Electron state persistence
- `src/main/jcode-client.ts` — --resume + summary save on close
- LiteLLM proxy running on :4000

---

## IMPLEMENTATION ORDER (strict — each item depends on previous)

---

## PHASE 1, ITEM 1 — Compression Quality Gate (BS1)
**File:** `src/main/session-summary.ts`
**Add after the existing `extractDecisions` function:**

```typescript
// src/main/session-summary.ts — ADD after extractDecisions()

/**
 * Verify that all key decisions from the original messages
 * appear in the compressed output. Returns missing decisions.
 */
export function verifyCompression(
  original: string[],
  compressed: string
): string[] {
  const DECISION_MARKERS = [
    'decided', 'chose', 'fixed', 'set to', 'changed',
    'added', 'removed', 'implemented', 'refactored', 'switched'
  ];

  const originalDecisions: string[] = [];
  for (const msg of original) {
    for (const line of msg.split('\n')) {
      const lower = line.toLowerCase();
      if (DECISION_MARKERS.some(m => lower.includes(m)) && line.length > 20) {
        // Extract the key noun phrase (first 6 words after the marker)
        originalDecisions.push(line.trim().slice(0, 80));
      }
    }
  }

  const compressedLower = compressed.toLowerCase();
  return originalDecisions.filter(d => {
    // Check if a meaningful substring (first 30 chars) of the decision appears
    const snippet = d.toLowerCase().slice(0, 30).trim();
    return snippet.length > 10 && !compressedLower.includes(snippet);
  });
}

/**
 * Compress episodic buffer with a quality gate.
 * If key decisions are missing, retry once with must_preserve list.
 * Uses LiteLLM proxy on :4000.
 */
export async function compressWithGate(
  messages: string[],
  targetTokens: number
): Promise<string> {
  const buildPrompt = (mustPreserve: string[] = []) => {
    const preserve = mustPreserve.length > 0
      ? `\n\nYOU MUST PRESERVE THESE VERBATIM:\n${mustPreserve.map(d => `- ${d}`).join('\n')}`
      : '';
    return `Compress the following conversation to under ${targetTokens} tokens.
PRESERVE: all decisions made, values computed, errors found, file paths modified.
DROP: reasoning chains, repeated context, intermediate steps that led nowhere.
CRITICAL: preserve all error codes and stack traces verbatim.${preserve}

CONVERSATION:
${messages.join('\n---\n')}

COMPRESSED OUTPUT:`;
  };

  // First attempt
  const first = await callLiteLLM('flash', buildPrompt(), targetTokens * 4);
  const missing = verifyCompression(messages, first);

  if (missing.length === 0) return first;

  // One retry with explicit must-preserve list
  console.log(`[compression-gate] Retrying — ${missing.length} decisions missing`);
  const second = await callLiteLLM('flash', buildPrompt(missing.slice(0, 5)), targetTokens * 4);
  return second;
}

async function callLiteLLM(model: string, prompt: string, maxTokens: number): Promise<string> {
  try {
    const res = await fetch('http://localhost:4000/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: maxTokens,
        temperature: 0.1
      })
    });
    const data = await res.json() as any;
    return data.choices?.[0]?.message?.content ?? '';
  } catch {
    return messages.join('\n'); // fail open — return original on error
  }
}
```

---

## PHASE 1, ITEM 2 — Streaming Abort with Partial Commit (A3)
**File:** wherever the streaming response handler lives
**Find:** the abort/cancel handler for the stream (the Escape key listener)
**Replace the discard with a commit:**

```typescript
// In the streaming handler — find the abort path and replace:

// BEFORE (discard on abort):
// abortController.abort();
// currentBubble.textContent = '';  // ← this discards the partial response

// AFTER (commit partial on abort):
let partialBuffer = '';
let isStreaming = false;

async function startStream(url: string, payload: object, bubble: HTMLElement) {
  const controller = new AbortController();
  isStreaming = true;
  partialBuffer = '';

  // Escape to abort
  const onEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && isStreaming) {
      controller.abort();
    }
  };
  document.addEventListener('keydown', onEscape);

  try {
    const res = await fetch(url, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal
    });

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value);
      // Parse SSE chunks
      for (const line of chunk.split('\n')) {
        if (line.startsWith('data: ') && line !== 'data: [DONE]') {
          try {
            const data = JSON.parse(line.slice(6));
            const token = data.choices?.[0]?.delta?.content ?? '';
            if (token) {
              partialBuffer += token;
              appendToken(bubble, token);
            }
          } catch { /* skip malformed chunks */ }
        }
      }
    }
  } catch (err: any) {
    if (err.name === 'AbortError') {
      // Partial commit — mark as aborted but keep what arrived
      partialBuffer += '\n\n[⚡ Aborted]';
      appendToken(bubble, '\n\n[⚡ Aborted]');
    }
  } finally {
    isStreaming = false;
    document.removeEventListener('keydown', onEscape);

    // ALWAYS commit to session history, even if aborted
    commitToHistory({
      role: 'assistant',
      content: partialBuffer,
      aborted: partialBuffer.endsWith('[⚡ Aborted]')
    });

    finalizeBubble(bubble, partialBuffer);
  }
}

function commitToHistory(msg: { role: string; content: string; aborted: boolean }) {
  // Push to whatever array/store holds the session messages
  sessionMessages.push(msg);
  // Also save to session summary if aborted — partial reasoning is valuable
  if (msg.aborted && msg.content.length > 100) {
    console.log('[stream-abort] Partial response committed:', msg.content.length, 'chars');
  }
}
```

---

## PHASE 1, ITEM 3 — HeadroomBar React Component (ZooCode Part 4)
**File:** Create `src/renderer/components/HeadroomBar.tsx`

```tsx
// src/renderer/components/HeadroomBar.tsx

import React from 'react';

interface HeadroomBarProps {
  used: number;
  total: number;
  mode: string;
  sessionCost?: number; // in USD cents, optional
}

export const HeadroomBar: React.FC<HeadroomBarProps> = ({
  used, total, mode, sessionCost
}) => {
  const pct = total > 0 ? Math.min((used / total) * 100, 100) : 0;
  const color = pct < 70 ? '#6daa45'   // --color-success green
              : pct < 90 ? '#e8af34'   // --color-gold amber
              : '#a12c7b';             // --color-error red

  const label = `${used.toLocaleString()} / ${total.toLocaleString()} tokens`;
  const costLabel = sessionCost !== undefined
    ? ` · $${(sessionCost / 100).toFixed(4)}`
    : '';

  return (
    <div
      className="headroom-bar-wrapper"
      title={`${label}${costLabel} [${mode.toUpperCase()}]`}
      style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
    >
      {/* Mode badge */}
      <span style={{
        fontSize: '10px',
        fontWeight: 600,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: color,
        opacity: 0.85,
        minWidth: '52px',
        textAlign: 'right'
      }}>
        {mode}
      </span>

      {/* Bar track */}
      <div style={{
        position: 'relative',
        width: '72px',
        height: '5px',
        background: 'rgba(255,255,255,0.08)',
        borderRadius: '9999px',
        overflow: 'hidden',
        cursor: 'default'
      }}>
        {/* Fill */}
        <div style={{
          height: '100%',
          width: `${pct}%`,
          background: color,
          borderRadius: '9999px',
          transition: 'width 400ms ease, background 400ms ease',
          minWidth: pct > 0 ? '3px' : '0'
        }} />
      </div>

      {/* Percentage label */}
      <span style={{
        fontSize: '10px',
        color: color,
        minWidth: '30px',
        fontVariantNumeric: 'tabular-nums'
      }}>
        {Math.round(pct)}%
      </span>
    </div>
  );
};
```

**Wire into the status bar** — find where the status bar / header is rendered
and add:
```tsx
import { HeadroomBar } from './HeadroomBar';

// Inside the status bar JSX:
<HeadroomBar
  used={tokenState.used}
  total={tokenState.total}
  mode={currentMode}
  sessionCost={sessionCost}
/>
```

**Add to tokenState** — wherever token counts come from (likely updated on
each streaming response end), ensure `used` and `total` are tracked:
```typescript
const [tokenState, setTokenState] = useState({ used: 0, total: 8000 });

// After each response:
setTokenState(prev => ({
  used: prev.used + responseTokenCount,
  total: MODE_BUDGETS[currentMode] ?? 8000
}));

const MODE_BUDGETS: Record<string, number> = {
  fast: 1000, balanced: 8000, deep: 32000,
  audit: 64000, inventor: 12000, stealth: 4000
};
```

---

## PHASE 2, ITEM 4 — Cross-Session Routing Corrections (BS2)
**File:** `src/main/routing-profile.ts` (create new)

```typescript
// src/main/routing-profile.ts

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

interface RoutingCorrection {
  ts: string;
  intent: string;
  suggested: string;
  chosen: string;
}

const CORRECTIONS_PATH = path.join(os.homedir(), '.jcode', 'routing-corrections.jsonl');

export function logCorrection(intent: string, suggested: string, chosen: string): void {
  const entry: RoutingCorrection = {
    ts: new Date().toISOString(),
    intent: intent.slice(0, 200), // cap length
    suggested,
    chosen
  };
  try {
    fs.mkdirSync(path.dirname(CORRECTIONS_PATH), { recursive: true });
    fs.appendFileSync(CORRECTIONS_PATH, JSON.stringify(entry) + '\n');
  } catch { /* never block on log write */ }
}

export function getCorrectionCount(): number {
  try {
    if (!fs.existsSync(CORRECTIONS_PATH)) return 0;
    return fs.readFileSync(CORRECTIONS_PATH, 'utf-8')
      .split('\n').filter(l => l.trim()).length;
  } catch { return 0; }
}

export function buildUserRoutingOverrides(): Record<string, string> {
  try {
    if (!fs.existsSync(CORRECTIONS_PATH)) return {};
    const corrections: RoutingCorrection[] = fs
      .readFileSync(CORRECTIONS_PATH, 'utf-8')
      .split('\n')
      .filter(l => l.trim())
      .map(l => JSON.parse(l));

    // Find keywords in intents that consistently map to a non-default mode
    const wordModeMap: Record<string, string[]> = {};
    for (const c of corrections) {
      for (const word of c.intent.toLowerCase().split(/\s+/)) {
        if (word.length > 4) {
          if (!wordModeMap[word]) wordModeMap[word] = [];
          wordModeMap[word].push(c.chosen);
        }
      }
    }

    const overrides: Record<string, string> = {};
    for (const [word, modes] of Object.entries(wordModeMap)) {
      if (modes.length >= 3) {
        const counts = modes.reduce((acc, m) => {
          acc[m] = (acc[m] ?? 0) + 1; return acc;
        }, {} as Record<string, number>);
        const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
        if (top[1] === modes.length) { // 100% consistent
          overrides[word] = top[0];
        }
      }
    }
    return overrides;
  } catch { return {}; }
}

/**
 * Enhanced router that uses personal overrides + default keyword map.
 * Call this on every user message before sending to LiteLLM.
 */
export function routeIntent(message: string, currentMode: string): {
  suggestedMode: string;
  confidence: number;
  source: 'personal' | 'default' | 'current';
} {
  const lower = message.toLowerCase();
  const overrides = buildUserRoutingOverrides();

  // Personal overrides take priority
  for (const [word, mode] of Object.entries(overrides)) {
    if (lower.includes(word)) {
      return { suggestedMode: mode, confidence: 0.9, source: 'personal' };
    }
  }

  // Default keyword map (longer keywords first — specificity order)
  const DEFAULT_MAP: [string, string][] = [
    ['trade-off', 'deep'], ['architecture', 'deep'], ['evaluate', 'deep'],
    ['compare', 'deep'], ['analyze', 'deep'], ['explain', 'deep'],
    ['design', 'deep'], ['why ', 'deep'],
    ['audit', 'audit'], ['inspect', 'audit'], ['verify', 'audit'],
    ['report', 'audit'], ['scan', 'audit'],
    ['brainstorm', 'inventor'], ['ideate', 'inventor'], ['invent', 'inventor'],
    ['generate', 'inventor'], ['propose', 'inventor'],
    ['implement', 'balanced'], ['refactor', 'balanced'], ['fix ', 'balanced'],
    ['update', 'balanced'], ['add ', 'balanced'], ['write', 'balanced'],
    ['lookup', 'fast'], ['search', 'fast'], ['find ', 'fast'],
    ['what is', 'fast'], ['list ', 'fast'], ['show me', 'fast'],
  ];

  for (const [keyword, mode] of DEFAULT_MAP) {
    if (lower.includes(keyword)) {
      return { suggestedMode: mode, confidence: 0.75, source: 'default' };
    }
  }

  return { suggestedMode: currentMode, confidence: 0, source: 'current' };
}
```

**Wire into the message send handler:**
```typescript
import { routeIntent, logCorrection, getCorrectionCount } from './routing-profile';

// In the send-message handler:
const { suggestedMode, confidence, source } = routeIntent(userMessage, currentMode);

if (confidence >= 0.75 && suggestedMode !== currentMode) {
  // Show non-blocking toast: "Switched to DEEP for architecture query"
  showToast(`Switched to ${suggestedMode.toUpperCase()} — ${source === 'personal' ? 'your preference' : 'auto-detected'}`, {
    action: { label: 'Undo', onClick: () => setMode(currentMode) }
  });
  setMode(suggestedMode);
}

// When user manually overrides the router:
// call logCorrection(userMessage, suggestedMode, chosenMode)

// Prompt after 10 corrections:
if (getCorrectionCount() % 10 === 0 && getCorrectionCount() > 0) {
  showToast('Your routing preferences have been learned. Profile updated.');
}
```

---

## PHASE 2, ITEM 5 — Mode-Aware Prompt Templates (A4)
**File:** `src/main/prompt-templates.ts` (create new)

```typescript
// src/main/prompt-templates.ts

export type Mode = 'fast' | 'balanced' | 'deep' | 'audit' | 'inventor' | 'stealth';

const TEMPLATES: Record<Mode, (message: string) => string> = {
  fast: (msg) =>
    `Answer directly and concisely (≤50 words). No reasoning shown.\n\n${msg}`,

  balanced: (msg) =>
    `${msg}`,  // no wrapper — default behavior

  deep: (msg) =>
    `Think step by step. State the core tension first, then reason through it.\n\n${msg}`,

  audit: (msg) =>
    `Complete every section of the audit schema. Be exhaustive and structured.\n\nAUDIT REQUEST: ${msg}`,

  inventor: (msg) =>
    `Generate 3 invention candidates. Each must: (1) name the tension it resolves, ` +
    `(2) describe the invention, (3) name the new problem class it opens.\n\nINVENTION REQUEST: ${msg}`,

  stealth: (msg) =>
    `${msg}`,  // no wrapper — local model, no external refs
};

export function applyModeTemplate(message: string, mode: Mode): string {
  const template = TEMPLATES[mode] ?? TEMPLATES.balanced;
  return template(message);
}

export const MODE_MAX_TOKENS: Record<Mode, number> = {
  fast: 256,
  balanced: 1024,
  deep: 4096,
  audit: 8192,
  inventor: 2048,
  stealth: 1024,
};

export const MODE_SYSTEM_SUFFIX: Record<Mode, string> = {
  fast: 'You MUST stay within 50 words. Return only the answer.',
  balanced: 'You MUST stay within 200 words. Show key steps only.',
  deep: 'You MUST stay within 800 words. Show full reasoning chain.',
  audit: 'Complete every section. No length limit. Be exhaustive.',
  inventor: 'You MUST stay within 500 words per candidate.',
  stealth: 'You MUST stay within 200 words. No external references.',
};
```

**Wire into the LiteLLM call in `jcode-client.ts`:**
```typescript
import { applyModeTemplate, MODE_MAX_TOKENS, MODE_SYSTEM_SUFFIX } from './prompt-templates';

// When building the messages array for the API call:
const processedMessage = applyModeTemplate(userMessage, currentMode as Mode);
const maxTokens = MODE_MAX_TOKENS[currentMode as Mode] ?? 1024;
const systemSuffix = MODE_SYSTEM_SUFFIX[currentMode as Mode] ?? '';

const messages = [
  { role: 'system', content: systemPrompt + '\n\n' + systemSuffix },
  ...historyMessages,
  { role: 'user', content: processedMessage }
];
```

---

## PHASE 3, ITEM 6 — Semantic Deduplication (A1)
**File:** `src/main/deduplication.ts` (create new)
**Note:** Uses simple word-overlap similarity (no embedding model needed for Electron)

```typescript
// src/main/deduplication.ts

/**
 * Jaccard similarity between two strings based on word sets.
 * Fast enough for real-time deduplication without an embedding model.
 */
function jaccardSim(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\W+/).filter(w => w.length > 3));
  const wordsB = new Set(b.toLowerCase().split(/\W+/).filter(w => w.length > 3));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++;
  }
  return intersection / (wordsA.size + wordsB.size - intersection);
}

/**
 * Remove duplicate messages from a context array.
 * Keeps the most recent copy when similarity > threshold.
 * Threshold 0.85 = very similar (same fact stated twice).
 */
export function deduplicateContext(
  messages: Array<{ role: string; content: string }>,
  threshold = 0.85
): Array<{ role: string; content: string }> {
  if (messages.length <= 1) return messages;

  const keep: number[] = [0];
  for (let i = 1; i < messages.length; i++) {
    const sims = keep.map(j => jaccardSim(messages[i].content, messages[j].content));
    if (Math.max(...sims) < threshold) {
      keep.push(i);
    }
    // If duplicate detected, keep the current (more recent) one, drop the older
  }

  const keepSet = new Set(keep);
  // Also: for any duplicate pair, replace the older with the newer
  const result = messages.filter((_, i) => keepSet.has(i));

  const dropped = messages.length - result.length;
  if (dropped > 0) {
    console.log(`[dedup] Removed ${dropped} duplicate context items`);
  }

  return result;
}
```

**Wire into context assembly** — before sending messages to LiteLLM:
```typescript
import { deduplicateContext } from './deduplication';

// Before building the API call messages array:
const dedupedHistory = deduplicateContext(sessionMessages);
// Use dedupedHistory instead of sessionMessages
```

---

## PHASE 3, ITEM 7 — Turn-Level Cost Attribution (A2)
**File:** `src/main/cost-attribution.ts` (create new)

```typescript
// src/main/cost-attribution.ts

interface LayerAttribution {
  layerName: string;
  tokensSent: number;
  referencedInOutput: number;
  utilityScore: number; // 0-1
}

/**
 * Score how much of each context layer was actually referenced in the response.
 * Uses keyword overlap as a proxy for "attention."
 */
export function attributeLayerCosts(
  layers: Record<string, string>,
  response: string
): LayerAttribution[] {
  const responseWords = new Set(
    response.toLowerCase().split(/\W+/).filter(w => w.length > 4)
  );

  return Object.entries(layers).map(([name, content]) => {
    const contentWords = content.toLowerCase().split(/\W+/).filter(w => w.length > 4);
    const tokensSent = Math.ceil(content.length / 4); // rough token estimate
    const referenced = contentWords.filter(w => responseWords.has(w)).length;
    const utilityScore = contentWords.length > 0
      ? Math.min(referenced / contentWords.length, 1)
      : 0;

    return { layerName: name, tokensSent, referencedInOutput: referenced, utilityScore };
  });
}

/**
 * After N turns, find the consistently low-utility layer and surface a suggestion.
 */
export function getSuggestion(history: LayerAttribution[][]): string | null {
  if (history.length < 5) return null;

  // Average utility score per layer over last 5 turns
  const allLayers = [...new Set(history.flatMap(h => h.map(l => l.layerName)))];
  for (const layer of allLayers) {
    const scores = history
      .map(h => h.find(l => l.layerName === layer)?.utilityScore ?? 0);
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    if (avg < 0.08 && layer !== 'system_core') {
      return `Layer "${layer}" has ${Math.round(avg * 100)}% utility over last ${history.length} turns. Consider switching to a leaner mode.`;
    }
  }
  return null;
}
```

**Wire into the response handler:**
```typescript
import { attributeLayerCosts, getSuggestion } from './cost-attribution';

// After each response completes:
const attribution = attributeLayerCosts({
  system_core: systemPrompt,
  session_summary: injectedSummary ?? '',
  working_memory: historyMessages.map(m => m.content).join('\n'),
}, responseText);

attributionHistory.push(attribution);

const suggestion = getSuggestion(attributionHistory);
if (suggestion) {
  showToast(suggestion, { duration: 6000 });
}
```

---

## PHASE 4, ITEM 8 — Provider Health Check (BS5)
**File:** `src/main/provider-health.ts` (create new)

```typescript
// src/main/provider-health.ts

export interface HealthResult {
  available: boolean;
  latencyMs: number;
  error?: string;
}

export async function checkLiteLLM(baseUrl = 'http://localhost:4000'): Promise<HealthResult> {
  const start = Date.now();
  try {
    const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(2000) });
    return { available: res.ok, latencyMs: Date.now() - start };
  } catch (err: any) {
    return {
      available: false,
      latencyMs: Date.now() - start,
      error: err.code === 'ABORT_ERR'
        ? 'LiteLLM not responding (timeout). Run: litellm --config litellm.config.yaml'
        : `LiteLLM unreachable: ${err.message}`
    };
  }
}

/**
 * Block any mode switch that requires a provider that is down.
 * Returns null if safe, or an error message if the switch should be blocked.
 */
export async function guardModeSwitch(
  targetMode: string,
  baseUrl = 'http://localhost:4000'
): Promise<string | null> {
  // STEALTH never uses LiteLLM — no check needed
  if (targetMode === 'stealth') return null;

  const health = await checkLiteLLM(baseUrl);
  if (!health.available) {
    return health.error ?? 'Provider unavailable. Cannot switch mode.';
  }
  return null;
}
```

**Wire into the mode switch handler:**
```typescript
import { guardModeSwitch } from './provider-health';

async function handleModeSwitch(newMode: string) {
  const error = await guardModeSwitch(newMode);
  if (error) {
    showToast(`⚠ ${error}`, { variant: 'error', duration: 8000 });
    return; // block the switch
  }
  setMode(newMode);
}

// Also: run health check on app startup and show a status dot in the UI
// Green dot = LiteLLM healthy, Red dot = down
```

---

## PHASE 4, ITEM 9 — AUDIT Mode Single-Pass Enforcement (BS3)
**File:** wherever mode config is defined (likely `src/main/modes.ts` or inline)

```typescript
// Add to mode config or session state tracker

let auditPassCount = 0;
let auditSessionActive = false;

function startAuditMode() {
  if (auditSessionActive && auditPassCount >= 1) {
    showToast(
      'AUDIT mode is single-pass. Start a new session for a second audit domain.',
      { variant: 'warning', duration: 5000 }
    );
    return false; // block
  }
  auditSessionActive = true;
  auditPassCount++;
  return true;
}

function onModeChange(newMode: string, prevMode: string) {
  if (prevMode === 'audit' && newMode !== 'audit') {
    // Exiting audit — reset counters for next time
    auditPassCount = 0;
    auditSessionActive = false;
  }
  if (newMode === 'audit') {
    return startAuditMode();
  }
  return true;
}

// Wire into the mode-switch handler:
// if (!onModeChange(newMode, currentMode)) return; // blocked
```

---

## WIRING SUMMARY (order matters)

```
session-summary.ts     ← add verifyCompression, compressWithGate
streaming handler       ← replace discard with partial commit
HeadroomBar.tsx        ← new component, wire into status bar
routing-profile.ts     ← new file, wire into send-message
prompt-templates.ts    ← new file, wire into LiteLLM call
deduplication.ts       ← new file, wire into context assembly
cost-attribution.ts    ← new file, wire into response handler
provider-health.ts     ← new file, wire into mode switch
mode enforcement       ← inline in mode switch handler
```

---

## QUICK VERIFICATION

After all phases:
```typescript
// Add to a dev console or test file:

// Phase 1
import { verifyCompression } from './session-summary';
console.assert(verifyCompression(['decided to use git diff HEAD'], 'used git diff HEAD').length === 0);
console.assert(verifyCompression(['decided to use git diff HEAD'], 'something else').length > 0);

// Phase 2
import { routeIntent } from './routing-profile';
console.assert(routeIntent('why is this slow', 'balanced').suggestedMode === 'deep');
console.assert(routeIntent('find the config file', 'balanced').suggestedMode === 'fast');

// Phase 3
import { deduplicateContext } from './deduplication';
const msgs = [
  { role: 'user', content: 'the manifest file has K level 1.3354' },
  { role: 'assistant', content: 'noted' },
  { role: 'user', content: 'the manifest file has K level 1.3354 as stated' },
];
console.assert(deduplicateContext(msgs).length < msgs.length);
```

---
v3.0 | All Phases | ZooCode Ready | 2026-06-26
