# Chat Panel + Browser Panel Redesign — Implementation Plan

Based on the roadmap from the user. Two major workstreams:

## Workstream A — Chat Panel React Redesign

Files to create in `src/renderer/components/ChatPanel/`:

| Step | File | Purpose |
|------|------|---------|
| 1 | `chat.types.ts` | Shared TS types (ChatMessage, ToolCall, etc.) |
| 2a | `useChatIpc.ts` | Hook: send IPC actions (send, cancel, reset, resume) |
| 2b | `useChatStream.ts` | Hook: `useReducer` receiving IPC event stream |
| 3a | `ToolBadge.tsx` | Animated tool status badge (⟳→✓→✗) |
| 3b | `ReasoningTrace.tsx` | Collapsible violet-border reasoning block |
| 3c | `BlinkingCursor.tsx` | Token-edge blinking cursor |
| 3d | `ContextPill.tsx` | @file / @symbol mention pill |
| 4 | `MessageList.tsx` | Virtualized message feed |
| 5 | `ChatPanel.tsx` | Main container assembly |
| — | `chat.css` | Design tokens scoped to component |

## Workstream B — Browser Panel as WebContentsView

Files to create/modify:

| Step | File | Purpose |
|------|------|---------|
| 7a | `src/main/browser-main.ts` | Tab management + IPC handlers (WebContentsView) |
| 7b | `browser-panel.html` (exists) | Tab bar + toolbar renderer (keep as-is) |
| 7c | Preload additions | Bounds sync, tab state IPC |
| 8 | `useBrowserTabs.ts` | Hook: subscribe to browser tab state |

## Preload changes

Add `window.electronAPI` with `send`, `invoke`, and `on` (returning unsubscribe fn).

## Integration Order

Steps 1-5 → Step 6 → Preload → Steps 7-8 → Build
