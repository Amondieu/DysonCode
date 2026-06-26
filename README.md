# DysonCode

**Electron + Monaco Editor + xterm.js + SQLite Chat** — a Cursor-like IDE shell for coding agents (jcode).

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Electron 33                        │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────┐ │
│  │  Sidebar │  │  Main Panel  │  │  Chat Panel   │ │
│  │          │  │              │  │               │ │
│  │ Sessions │  │  Monaco      │  │  Messages     │ │
│  │ FileTree │  │  Editor      │  │  Input        │ │
│  │ RepoPick │  │              │  │               │ │
│  │          │  │  xterm.js    │  │               │ │
│  └──────────┘  └──────────────┘  └───────────────┘ │
│                                                     │
│  ┌─────────────────────────────────────────────────┐│
│  │  Main Process (Node.js)                         ││
│  │  ├─ node-pty → jcode / shell                    ││
│  │  ├─ sql.js (WASM SQLite) → chat persistence     ││
│  │  ├─ fs → file read/write                        ││
│  │  └─ IPC bridge (contextBridge)                  ││
│  └─────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────┘
```

## Tech Stack

| Layer | Tool | Purpose |
|---|---|---|
| **Shell** | Electron 33 | Native desktop window |
| **Editor** | Monaco Editor | Code viewing/editing |
| **Terminal** | xterm.js + node-pty | Embedded PTY terminal |
| **Database** | sql.js (WASM SQLite) | Zero-compile chat persistence |
| **UI** | React 18 + Tailwind CSS 3 | Component framework + styling |
| **State** | Zustand | Lightweight state management |
| **Build** | Vite + vite-plugin-electron | Fast dev/build pipeline |

## Project Structure

```
DysonCode/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.js
├── src/
│   ├── main/               # Electron main process
│   │   ├── index.ts         # Window creation, app lifecycle
│   │   ├── preload.ts       # contextBridge IPC API
│   │   ├── ipc-handlers.ts  # All IPC handler registration
│   │   ├── db.ts            # SQLite via sql.js (WASM)
│   │   └── terminal-manager.ts  # node-pty lifecycle
│   ├── renderer/            # React UI
│   │   ├── index.html
│   │   ├── index.tsx
│   │   ├── App.tsx          # Root layout + panel tabs
│   │   ├── components/
│   │   │   ├── Sidebar.tsx
│   │   │   ├── SessionList.tsx
│   │   │   ├── FileTree.tsx
│   │   │   ├── RepoPicker.tsx
│   │   │   ├── Terminal.tsx
│   │   │   ├── Editor.tsx
│   │   │   ├── ChatPanel.tsx
│   │   │   └── ChatMessage.tsx
│   │   ├── hooks/
│   │   │   └── useIpc.ts
│   │   ├── store/
│   │   │   └── appStore.ts
│   │   └── styles/
│   │       └── index.css
│   └── types/
│       └── sql.js.d.ts
└── dist/                    # Build output
```

## Getting Started

```bash
# Install dependencies
npm install

# Development (hot-reload)
npm run dev

# Production build
npm run build

# Run Electron
npm start
```

## LLM Runtime

DysonCode reads `.env` or `.env.local` from the workspace root when the Electron main process starts.

```env
LITELLM_BASE_URL=http://127.0.0.1:4000/v1
LITELLM_API_KEY=grey-os-local

# Optional direct fallback if the Grey-OS proxy is unavailable
KORE_AGENT_FALLBACK_URL=http://127.0.0.1:8080/v1
KORE_AGENT_FALLBACK_API_KEY=sk-local
KORE_AGENT_FALLBACK_MODEL=SET-A
```

If `:4000` is reachable but the API key is wrong, DysonCode now fails fast instead of silently falling through to another endpoint.

## Database Schema

- **sessions** — chat sessions with title, repo_path, timestamps
- **messages** — user/assistant/system/tool messages per session
- **session_summaries** — persistent summaries with key files & decisions

## Features

- [x] Sidebar with collapsible session list
- [x] File tree browser for local repositories
- [x] Embedded xterm.js terminal with node-pty
- [x] Monaco Editor with syntax highlighting for 30+ languages
- [x] Chat panel with message history persistence
- [x] "Resume Last Session" on startup
- [x] Dark theme (GitHub-style)
- [x] Session CRUD (create, rename, delete)
- [ ] jcode agent integration (bridge ready)
- [ ] Git diff/branch visualization
- [ ] Multi-window support

## License

MIT
