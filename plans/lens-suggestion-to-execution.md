# ΛENS Suggestion → Execution Bridge — Implementation Plan

**Date**: 2026-06-24  
**Status**: Spec received, 6-slice plan below  
**Files affected**: `UIAnalystPanel.tsx`, `ChatMessage.tsx`, `BlueprintWorkspace.tsx`, new `restart-classifier.ts`

---

## Slice 1 — Copy-as-Prompt (30 min)

**File**: [`UIAnalystPanel.tsx`](../src/renderer/components/UIAnalystPanel.tsx)

Add `buildPromptText()` function that generates the structured prompt from a `LensSuggestion`. Add `[📋 Copy as Prompt]` button to each card. On click, copies formatted prompt to clipboard.

```typescript
function buildPromptText(s: LensSuggestion, mode: string): string {
  return [
    `[ΛENS UI Suggestion — DysonCode ${mode.toUpperCase()} Mode]`,
    `\nCONTEXT: DysonCode ${mode} Mode — ${s.target}`,
    `\nOBSERVATION: ${s.rationale}`,
    `\nSUGGESTION: ${s.title}`,
    `\nSCORE: ${s.score}/35`,
    ...Object.entries(s.dimensions).map(([k,v]) => `${k}: ${v}`),
    `\nRATIONALE: ${s.rationale}`,
    `\nCONSTRAINTS: Do not introduce new tokens. Use existing design system.`,
  ].join('\n');
}
```

## Slice 2 — Restart Classifier (45 min)

**File**: `src/renderer/data/restart-classifier.ts` (new)

Pure function: given a file path and change type, returns restart level 0-3.

```typescript
type RestartLevel = 0 | 1 | 2 | 3;
interface RestartNotice {
  level: RestartLevel;
  label: string;
  icon: string;
  color: string;
}

function classifyRestart(filePath: string, changeType: string): RestartNotice {
  // Level 0: component-local styles, inline CSS, token refs, JSX structure
  if (/\.css$|\.scss$|style=|className/.test(filePath)) return { level: 0, ... };
  // Level 1: component logic, props, local state
  if (/\/components\//.test(filePath)) return { level: 1, ... };
  // Level 2: build config, global styles, shared utils, env, plugins
  if (/vite\.config|tsconfig|\.env|global|shared/.test(filePath)) return { level: 2, ... };
  // Level 3: package.json, lock files, native modules, Docker, DB, CI
  return { level: 3, ... };
}
```

## Slice 3 — Send-to-Architect (1h)

**File**: [`UIAnalystPanel.tsx`](../src/renderer/components/UIAnalystPanel.tsx)

Add `[→ Architect]` button. On click:
1. Compute restart level via `classifyRestart()`
2. Add suggestion to a `lensQueue` state array with pipeline status
3. Show pipeline status line (QUEUED/PLANNING/EXECUTE) on card
4. Wire into `handlePlanAndExecute` in BlueprintWorkspace

**File**: [`BlueprintWorkspace.tsx`](../src/renderer/components/BlueprintWorkspace.tsx)

Add `lensSuggestion` state. When present, show `🔬 ΛENS` origin badge in Canvas mode header. Modify `buildContext()` to include ΛENS suggestion context.

## Slice 4 — Restart Notice in Execute Button (45 min)

**File**: [`BlueprintWorkspace.tsx`](../src/renderer/components/BlueprintWorkspace.tsx)

In the state machine panel area, when `execState === 'execute'` and a lens suggestion is active:
- Show restart notice above Execute button
- Level 0: green `⚡ Live — no restart required`
- Level 1: blue `🔄 Save to apply — component refresh only`
- Level 2: amber `⚠️ Dev server restart required`, button label changes
- Level 3: red `🔴 Full restart required`, button label changes, show ordered steps

## Slice 5 — Universal Copy Affordance (1h)

**File**: [`ChatMessage.tsx`](../src/renderer/components/ChatMessage.tsx)

Add copy icon to code blocks (top-right, visible on hover), copies raw code.

**File**: [`UIAnalystPanel.tsx`](../src/renderer/components/UIAnalystPanel.tsx)

Add small copy icon to top-right of each suggestion card (visible on hover), copies plain text.

**File**: New `CopyButton` component or inline pattern:
```tsx
function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="absolute top-1.5 right-1.5 w-4 h-4 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 hover:bg-white/10 transition-opacity"
      aria-label={label}>
      {copied ? '✓' : '📋'}
    </button>
  );
}
```

## Slice 6 — Batch Send (30 min)

**File**: [`UIAnalystPanel.tsx`](../src/renderer/components/UIAnalystPanel.tsx)

When 2+ suggestions are confirmed, show `Send All Confirmed to Architect` button at top. Sorts by composite score (highest first), applies dependency ordering from restart classifier. Each item enters as separate STATE entry.

---

## Dependency Map

```
Slice 1 (Copy-as-Prompt)   ← no dependencies
Slice 2 (Restart Classifier) ← no dependencies
Slice 3 (Send-to-Architect) ← depends on Slice 2
Slice 4 (Restart Notice UI) ← depends on Slice 2 + Slice 3
Slice 5 (Copy Affordance)   ← no dependencies
Slice 6 (Batch Send)        ← depends on Slice 3
```

**Parallelizable**: Slices 1+2+5 can be built simultaneously. Then 3, then 4+6.
