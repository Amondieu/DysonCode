# kore-exec — Execution Backend Spezifikation

**Datum:** 2026-06-23  
**Kontext:** Grey-OS / KORE Sprint 5b  
**Ziel:** jcode-Geschwindigkeit + KORE-Stabilität + kein Fork-Maintenance-Overhead

---

## 0. Leitprinzip

```
Rust für die I/O-Kante.
Python für Entscheidungen.
subprocess für Panic-Isolation.
jcode-TUI optional als Frontend.
```

Bei D3/D4 (autonomer Modus) ist der Flaschenhals Modell-Inferenz + Recovery-Loops — nicht `fs::read_to_string`. Rust lohnt sich dort, wo viele kleine, schnelle Tool-Calls laufen: Builder + lokale Modelle (SET-A `coder`), ripgrep-ähnliche Suchen, Datei-Diffs.

---

## 1. Architektur — Dreischichten-Split

```
┌──────────────────────────────────────────────────┐
│  KORE Orchestrator (Python)                      │
│  orchestrator.py / role_engine.py / done_gate.py │
│  State Machine, Failure→Constraint, Routing      │
└────────────────────┬─────────────────────────────┘
                     │
          BuilderSession (1 Knoten = N ToolCalls)
                     │
          ExecutionAdapter (Protocol)
          kore/execution/adapter.py
                     │
         ┌───────────┴───────────┐
         ▼                       ▼
┌─────────────────┐    ┌──────────────────────┐
│  KoreExecBackend│    │  OpenHandsBackend    │
│  (Rust, neu)    │    │  (Python, Sprint 7)  │
│  subprocess JSON│    │  Sandbox/CI          │
│  File/Shell/Grep│    │                      │
└────────┬────────┘    └──────────────────────┘
         │
┌────────▼────────┐
│  jcode TUI (opt)│  ← D0/D1, Electron node-pty (HANDOFF.md)
└─────────────────┘
```

### Routing-Regel

| Task-Typ | Backend | Grund |
|---|---|---|
| Viele kleine Edits, Builder tight loop | `KoreExecBackend` | µs File-I/O |
| Cross-Module Refactor, Docker, CI | `OpenHandsBackend` | Sandbox, Isolation |
| Manuelle Session D0/D1 | jcode TUI via PTY | UX |
| PII-sensitiv | `KoreExecBackend` (lokal) | kein Cloud-Leak |

---

## 2. Drei Ebenen (kritisch)

| Ebene | Verantwortung | Artefakt |
|---|---|---|
| **Orchestrator** | 1 Dyson-Knoten = 1 Rollen-Session | `TaskNode` |
| **BuilderSession** | N ToolCalls bis `CodeDelta` fertig | `CodeDelta` / `FailureNote` |
| **ExecutionAdapter** | 1 ToolCall = 1 subprocess-JSON | `ToolResult` |

`TaskNode` hat **kein** `tool`/`args` — ToolCalls kommen aus der Builder-Loop.

---

## 3. ExecutionAdapter Protocol

Siehe `kore/execution/adapter.py`.

### ToolCallStatus → DysonState

| Status | Ziel | Aktion |
|---|---|---|
| `OK` | Session weiter | Aggregieren zu `CodeDelta` |
| `ERROR` | `HEALING` | `fail_node(FailureNote)` |
| `TIMEOUT` | `HEALING` | `ACTION_RETRY`, ggf. Backend-Wechsel |
| `FATAL` | `BLOCKED` / `HUMAN_GATE` | Binary fehlt, kein JSON, wiederholter Crash |

`on_fatal()` gibt `FailureNote` zurück — **kein Exception-Raise**.

---

## 4. JSON-Protocol (subprocess Bridge)

### Input (stdin)

```json
{
  "version": 1,
  "tool": "read_file",
  "args": {"path": "src/main.py"},
  "workspace_root": "/abs/path/to/repo",
  "node_id": "B2",
  "role": "builder"
}
```

### Output (stdout)

```json
{"status": "ok", "output": "...", "exit_code": 0, "duration_ms": 1.2}
```

```json
{
  "status": "error",
  "output": "",
  "exit_code": 1,
  "duration_ms": 0.8,
  "error": "File read failed: src/main.py — No such file or directory"
}
```

### Python: drei Ausgänge

| Situation | Behandlung |
|---|---|
| exit 0 + JSON | `OK` oder `ERROR` (status-Feld) |
| exit != 0 + JSON auf stdout | `ERROR` |
| exit != 0 + kein/leeres JSON | `FATAL` (Panic/Crash) |
| `TimeoutExpired` | `TIMEOUT` |

### Security

Alle Pfade via `canonicalize` + Präfix-Check gegen `workspace_root`. `shell`: cwd locked.

---

## 5. kore-exec Rust Crate

```
kore-exec/
├── Cargo.toml
├── src/
│   ├── main.rs
│   ├── lib.rs
│   ├── error.rs
│   ├── protocol.rs
│   └── tools/
│       ├── mod.rs
│       ├── read_file.rs
│       ├── write_file.rs
│       ├── shell.rs
│       ├── grep.rs
│       └── diff.rs
└── tests/
    └── integration.rs
```

Build-Order: `error.rs` → `protocol.rs` → tools → `main.rs` → integration tests.

---

## 6. Sprint-Einordnung

| Sprint | Artefakt | Status |
|---|---|---|
| 5 | `execution/adapter.py`, `KoreExecBackend`, `BuilderSession` | done |
| 5b | `kore-exec` Rust Crate | done |
| 6 | `constraint_store.py`, `dyson_road.py`, `classify_tool_call` | done |
| 7 | `OpenHandsBackend`, `HarnessEngine`, `DoneGate.evaluate_sprint` | done |
| 8 | `EXEC_BACKEND` Event + Mission Control Badge | planned |

---

## 7. Was NICHT gebaut wird

| Komponente | Grund |
|---|---|
| Vollständiger jcode-Fork | Fork-Maintenance dauerhaft |
| PyO3 in-process | Keine Panic-Isolation |
| RouteLLM pip package | abacus-free-f + Vesica reichen |

---

## 8. Performance-Zielwerte (zu benchmarke)

| Operation | kore-exec (Ziel) | subprocess Bridge |
|---|---|---|
| read_file 10KB | ~50 µs | +1–2 ms/call |
| grep 1000 Dateien | ~5 ms | — |
| diff 500 Zeilen | ~200 µs | — |

Bei LLM-Turn (>500 ms) ist Bridge-Overhead irrelevant.
