# ZooCode Chat Upgrade Plan

Based on [`JcodeChatPlans/zoocode_jcode_upgrade.md`](JcodeChatPlans/zoocode_jcode_upgrade.md)

## Already Implemented

| Feature | Status | Files |
|---|---|---|
| User messages in chat history | ✅ | `MessageList.tsx` renders `msg.role === 'user'` bubbles immediately |
| Token streaming | ✅ | `useChatStream.ts` with RAF batching |
| Tool badges with color states | ✅ | `ToolBadge.tsx` — ⟳ gold / ✓ green / ✗ red |
| jcode cyan-teal design tokens | ✅ | `index.css` — `--jcode-cyan`, `--jcode-bg`, etc. |
| JetBrains Mono font | ✅ | Applied in ToolBadge, ContextPill |
| Avatar badge (jc) | ✅ | Cyan `jc` badge on assistant messages |
| Scanline overlay | ✅ | CSS class on ChatPanel root |
| Custom scrollbar | ✅ | Thin 4px dark scrollbar |
| Auto-scroll during streaming | ✅ | `MessageList.tsx` debounced scroll |

## Not Yet Implemented (6 items)

| # | Feature | Files to modify |
|---|---|---|
| **4** | Copy-to-clipboard button on each assistant message | `MessageList.tsx` — add `.copy-btn` to assistant MessageRow, visible on hover, clipboard API |
| **B1** | Typing indicator (bouncing dots before first token) | `MessageList.tsx` — show during `msg.streaming && msg.content === ''` |
| **B2** | Collapsible step groups (`<details>`) wrapping tool badges | `MessageList.tsx` — wrap tool badges in `<details>` with summary showing "N steps - Done" |
| **B3** | Message timestamps on hover using `Intl.RelativeTimeFormat` | `MessageList.tsx` — add relative timestamp span, visible on hover |
| **B4** | Keyboard shortcuts (Enter submit, Shift+Enter newline, Escape cancel, Ctrl+K focus) | `ChatPanel.tsx` — add keydown handler for Escape (abort) + Ctrl+K (focus input) |
| **B5** | Token speed indicator (live tok/s during streaming) | `MessageList.tsx` — show `N tok/s` near streaming message |
| **B6** | Auto-scroll with manual scroll override (pause on scroll-up, resume on scroll-to-bottom) | `MessageList.tsx` — track scroll position, pause auto-scroll if user scrolled up |

## Implementation Order

1. Copy button — 1 file, ~30 lines, highest impact
2. Typing indicator — 1 file, ~15 lines
3. Keyboard shortcuts — 1 file, ~20 lines
4. Auto-scroll override — 1 file, ~15 lines
5. Timestamps — 1 file, ~10 lines  
6. Collapsible steps — 1 file, ~15 lines
7. Token speed — 1 file, ~10 lines
