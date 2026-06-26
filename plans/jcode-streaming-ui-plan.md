# Jcode Streaming UI — Implementation Plan

## Decision: New Component, Not Replacement

The proposed ChatPanel rewrite is architecturally **a new jcode agent panel**, not an iteration of the existing chat. They share different concerns:

| Aspect | Existing ChatPanel | Proposed JcodePanel |
|---|---|---|
| State | Global (Zustand store) | Local (useState) |
| Persistence | SQLite via IPC | None (ephemeral) |
| LLM calls | `ipc.agent.execute()` | `callLLM()` wrapper |
| Flow integration | Routes to flow agents | None |
| Output format | Plain text + ChatMessage | Tool badges + clean summary |
| Session mgmt | Create/load/switch sessions | None |

**Plan: Create `JcodePanel.tsx` as a new component, toggleable from the ChatPanel header.** This preserves all existing functionality, avoids breaking 5+ files that depend on ChatPanel, and lets users switch between modes.

---

## Files to Create (3) + Files to Modify (2)

### 1 — [`src/jcode/systemPrompt.ts`](src/jcode/systemPrompt.ts) ⬤ NEW

Create directory and file with the `JCODE_SYSTEM_PROMPT` constant exactly as provided.

No integration needed — JcodePanel imports it directly.

### 2 — [`src/renderer/utils/callLLM.ts`](src/renderer/utils/callLLM.ts) ⬤ NEW

The proposed ChatPanel references `callLLM(ctx)` but never defines it. This file fills that gap.

```typescript
// Thin wrapper around agent.execute for the jcode agent loop.
// Uses the preload bridge via (window as any).dyson.

type LLMMessage = { role: string; content: string };

export async function callLLM(messages: LLMMessage[]): Promise<string> {
  // Extract system prompt from messages[0] if present
  const systemMsg = messages[0]?.role === 'system' ? messages[0].content : undefined;
  const userMessages = systemMsg ? messages.slice(1) : messages;

  // Use the LAST user message as the prompt; join prior context before it
  const lastUserMsg = userMessages.findLast(m => m.role === 'user');
  const priorContext = userMessages
    .filter(m => m !== lastUserMsg)
    .map(m => `[${m.role}]: ${m.content}`)
    .join('\n\n');

  const prompt = priorContext
    ? `${priorContext}\n\n---\n\n${lastUserMsg?.content || ''}`
    : lastUserMsg?.content || '';

  const result = await (window as any).dyson.agent.execute({
    sessionId: 'jcode-agent',
    nodeId: 'jcode-chat',
    prompt,
    model: 'flash-k2',
    context: systemMsg,
  });

  return result.content;
}
```

### 3 — [`src/renderer/components/JcodePanel.tsx`](src/renderer/components/JcodePanel.tsx) ⬤ NEW

Full component based on the user's proposed ChatPanel code, with these modifications:

| Proposed Code | Actual Implementation |
|---|---|
| `callLLM(ctx)` | Import from `../utils/callLLM` |
| `JCODE_SYSTEM_PROMPT` | Import from `../../jcode/systemPrompt` |
| CSS `--color-*` vars | Uses `var(--dyson-*)` mapping (see step 5) |
| `export function ChatPanel()` | Changed to `export function JcodePanel()` |
| Tool icons | Use emoji (as proposed) — no external deps needed |

**Architecture:**
- Local state only: `messages`, `input`, `isWorking`, `history`
- `handleSend` → agentic loop (up to 12 rounds) with streaming tool badges
- Each round: callLLM → parseDSML → if tool calls: show badges → execute runTool → update badges → feed back results
- Final clean output when no tool calls remain

**Sub-components (inline, no separate files needed):**
- `ToolBadge` — expandable card showing name, args, duration, status, output
- `MessageBubble` — renders user/tool-group/thinking/final messages
- `ThinkingDots` — pulsing animation while LLM is responding

### 4 — [`src/renderer/styles/index.css`](src/renderer/styles/index.css) ⬤ MODIFY

Add theme variable aliases that the JcodePanel's inline styles reference:

```css
/* JcodePanel streaming UI theme aliases */
:root {
  --color-bg: rgb(var(--dyson-bg));           /* #0d1117 */
  --color-surface: rgb(var(--dyson-panel));    /* #161b22 */
  --color-surface-offset: rgb(var(--dyson-elevated)); /* #1d232c */
  --color-border: rgb(var(--dyson-border));    /* #30363d */
  --color-primary: rgb(var(--dyson-accent));   /* #58a6ff */
  --color-text: rgb(var(--dyson-text));        /* #c9d1d9 */
  --color-text-muted: rgb(var(--dyson-muted)); /* #8b949e */
  --color-text-faint: #484f58;
  --color-text-inverse: #ffffff;
  --color-success: #3fb950;
  --color-error: #f85149;
  --color-gold: #d29922;
}
```

Also add `@keyframes spin` and `@keyframes pulse` animations.

### 5 — [`src/renderer/components/ChatPanel.tsx`](src/renderer/components/ChatPanel.tsx) ⬤ MODIFY

Add a mode toggle in the chat header to switch between **Chat** (current) and **Jcode** (new) modes:

```
Header before:  ● Chat — 5 messages  [jcode] [↺ new] [⚡ send]
Header after:   [💬 Chat | ⚡ Jcode]  ● Chat — 5 messages  [↺ new]
```

When "Jcode" tab is active, render `<JcodePanel />` instead of the current ChatPanel content.

Implementation:
- Import `JcodePanel` (lazy, to avoid bundle bloat)
- Add `chatMode` state: `'chat' | 'jcode'`, persisted to `localStorage('kore-chat-mode')`
- Render `<JcodePanel />` when `chatMode === 'jcode'`, else render existing content

```tsx
import { lazy, Suspense } from 'react';
const JcodePanel = lazy(() => import('./JcodePanel'));

// In the header, add mode tabs:
// [💬 Chat] [⚡ Jcode]

// In the body:
{chatMode === 'jcode' ? (
  <Suspense fallback={<div className="...">loading...</div>}>
    <JcodePanel />
  </Suspense>
) : (
  /* existing ChatPanel content */
)}
```

---

## Dependency Graph

```
JcodePanel.tsx
  └─ imports parseDSML, runTool from ./utils/dsml-parser  ✔ (already updated)
  └─ imports callLLM from ../utils/callLLM                  ⬤ NEW
  └─ imports JCODE_SYSTEM_PROMPT from ../../jcode/systemPrompt ⬤ NEW
  └─ uses CSS var(--color-*) from styles/index.css          ⬤ MODIFY

ChatPanel.tsx
  └─ imports JcodePanel (lazy)                              ⬤ NEW
  └─ adds chatMode toggle in header                         ⬤ MODIFY

No changes needed:
  - App.tsx                (renders ChatPanel as-is)
  - PanelContentRenderer   (renders ChatPanel as-is)
  - preload.ts             (already has window.dyson + window.api)
  - ipc-handlers.ts        (already has all handlers)
  - dsml-parser.ts         (already updated for toolbridge)
  - tool-registry.ts        (already updated)
```

---

## Order of Execution

1. Create `src/jcode/systemPrompt.ts`
2. Create `src/renderer/utils/callLLM.ts`
3. Add CSS variables to `src/renderer/styles/index.css`
4. Create `src/renderer/components/JcodePanel.tsx`
5. Modify `src/renderer/components/ChatPanel.tsx` — add mode toggle + JcodePanel import
6. `npm run build` → verify TypeScript + Vite compilation
7. `npm run pack` → repackage portable exe
8. Test: launch, type a task, verify tool badges stream in real time
