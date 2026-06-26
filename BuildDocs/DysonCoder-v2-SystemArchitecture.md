# DYSON CODER — COMPLETE SYSTEM ARCHITECTURE v2

**Version**: 2.0  
**Date**: 2026-06-24  
**Status**: Specification — Slice 1 ready for deployment  
**RC Score**: 7/7  

---

## The Frozen Core — Three Invariants

These override everything else. No persona, no subagent, no calibration can violate them.

1. **Typed Communication Only.** No persona reads another persona's full output. All communication is typed, directed, and routed through `STATE` or direct delta notifications.

2. **Interface Before Implementation.** No implementation is written before its interface is locked in `STATE`. Interface availability gates work, not implementation availability.

3. **Reviewer Gates All Improvements.** No improvement propagates to the system without passing the Reviewer's single metric-divergence question. The system cannot optimize for the wrong thing without detecting it.

---

## The Shared State Object — `STATE`

`STATE` is the only memory the system shares. It is written in assertion notation. It has exactly four sections, always present, always in this order.

### LOCKED
Interface specifications, frame constraints, file ownership assignments. Nothing in this section changes without an Architect-level decision that routes through the hidden loop.

```
STATE LOCKED
- interface: auth_v2 — POST /login, POST /refresh, GET /session
- constraint: C-ext-1 — external agents receive compressed context only
- file-owner: src/auth/login.ts → builder-subagent-3
```

### IN-PROGRESS
What is being built, by which persona or subagent, since when. One line per active work item.

```
STATE IN-PROGRESS
- builder-subagent-3: implementing auth_v2/login — started 14:22
- builder-subagent-4: implementing auth_v2/refresh — started 14:22
```

### BLOCKED
What cannot proceed, why, and which persona owns the resolution. One line per blocker. A blocker with no owner is a system failure — the Forge flags it on next observation.

```
STATE BLOCKED
- auth_v2/session: circular dependency detected — owner: Architect
```

### READY
What has converged and is available for downstream consumption. Interface, module, or decision. One line per ready artifact.

```
STATE READY
- interface: auth_v2/login — converged, 3 ASSERTs verified
- module: auth_v2/login.ts — implemented, Critic passed, Tester PASS
```

### STATE Overhead
- Reading: 10–20 tokens per relevant section
- Writing: 1–3 lines per update
- Total overhead per persona turn: under 30 tokens

---

## The Nine Keywords

Tier three observations have no keyword. They are structurally inexpressible in this language. They are collected silently and appended as a polish note to final output. They never enter any loop.

| # | Keyword | Emitted By | Meaning |
|---|---------|-----------|---------|
| 1 | `ASSERT` | Architect, Builder | Structural claim — subject verb consequence |
| 2 | `FAIL` | Reviewer, Critic | Named failure mode — tier 1 or tier 2 only |
| 3 | `PATCH` | Architect, Builder | Targeted fix referencing a specific FAIL |
| 4 | `CHECK` | Reviewer | Binary convergence confirmation — RESOLVED or UNRESOLVED |
| 5 | `DELTA` | All personas | Change declaration — exactly what changed between rounds |
| 6 | `STATE` | All personas | Shared state update — four mandatory fields |
| 7 | `GAP` | Navigator | Dimension absent from current frame — injection points 1 and 3 |
| 8 | `HARVEST` | Navigator | Existing capability addressing a FAIL or GAP — injection point 2 |
| 9 | `REORDER` | Navigator | Sequence change eliminating downstream work — injection point 3 only |

---

## The Eight Personas

### Architect (ROLLE I)
**Function**: Generates interface specifications and structural decisions. Reasons forward into possibility space.

**Hidden cycle**: Runs Architect-Reviewer-Navigator loop before emitting any interface or plan. Three rounds maximum. Assertion notation only. Output is invisible to user by default — only the converged plan reaches the user.

**Speaks to**: Reviewer via `ASSERT` in hidden loop. Builder subagents via `STATE LOCKED` section. Navigator at injection point zero.

**Never speaks to**: Tester, Memory Keeper, Forge directly.

**Receives from**: Reviewer via `FAIL` in hidden loop. Navigator via `GAP` and `HARVEST`. Critic via escalated interface failures only (tier 1 interface specification errors).

**STATE obligation**: Writes interface specifications to `LOCKED` before any Builder work begins. Updates `READY` when interface is converged.

**Implemented in**: `src/renderer/components/BlueprintWorkspace.tsx` — `DELIB_ARCHITECT_PROMPT`, `ARCHITECT_SYSTEM_PROMPT`

---

### Reviewer (ROLLE II)
**Function**: Attacks structural assumptions. Reasons backward from failure modes. Applies triage filter — tier one and tier two only.

**Hidden cycle**: Runs inside Architect's deliberation loop. Also runs as standalone reviewer of Forge proposals.

**Triage rule**: Tier one = structural failure causing plan to fail entirely. Tier two = load-bearing gap significantly reducing quality. Tier three = suppressed, collected silently, appended as polish note to final output.

**Speaks to**: Architect via `FAIL` notation. Forge via `FORGE-APPROVED` or `FORGE-BLOCKED`.

**STATE obligation**: None during hidden loop. Updates `STATE` only when a Forge proposal is approved — records the calibration as a `LOCKED` update.

**Implemented in**: `src/renderer/components/BlueprintWorkspace.tsx` — `DELIB_REVIEWER_PROMPT`, `REVIEWER_SYSTEM_PROMPT`

---

### Navigator — ΠΛΟΗΓΟΣ
**Function**: Reasons laterally across gap geometry. Finds what is absent from the current frame. Runs at three injection points only.

**Injection point 1** — After Frame Lock, before round one. Emits `GAP` on the locked frame itself.

**Injection point 2** — After each `FAIL` emission. Emits `HARVEST` if an existing capability addresses the failure.

**Injection point 3** — After convergence, before Ratchet score. Full five-operation metacognitive pass. Maximum five lines of `GAP`, `HARVEST`, or `REORDER`.

**Speaks to**: Architect via `GAP` and `REORDER`. Builder via `HARVEST` on FAIL escalation.

**Never speaks to**: Tester, Memory Keeper, Forge.

**STATE obligation**: Emits `GAP` findings to `BLOCKED` if locked frame missing a dimension. Emits `HARVEST` to `READY` when existing capability resolves a blocker.

**Implemented in**: `src/renderer/components/BlueprintWorkspace.tsx` — `NAVIGATOR_SYSTEM_PROMPT`, `DELIB_NAVIGATOR_PROMPT`, `runNavigator()`

---

### Builder (ROLLE III)
**Function**: Implements interfaces. Spawns parallel subagents when modules have no shared file dependencies.

**Subagent spawn condition**: Each subagent owns exactly one module. Ownership declared in `STATE` before any code is written. Two subagents cannot own overlapping files. If overlap detected, `STATE` conflict fires and work pauses until Architect resolves.

**Hidden self-check — two passes before emitting**:
- Pass one: Does this implementation satisfy every field in the interface contract exactly as specified in `STATE LOCKED`?
- Pass two: Does this implementation introduce any surface area not covered by the existing test plan in `STATE`?
- If both pass, emit. If either fails, patch internally. The Critic never sees a first draft.

**Speaks to**: `STATE` via ownership declarations and completion signals. Critic via `DELTA` notifications. Other subagents only via `STATE` conflict escalation.

**Never speaks to**: Architect directly (except STATE conflict). Reviewer. Navigator. Memory Keeper. Tester directly.

**STATE obligation**: Writes ownership to `IN-PROGRESS` on spawn. Writes `DELTA` to `READY` on completion. Updates `IN-PROGRESS` to `READY` after self-check passes.

**Implemented in**: `src/renderer/components/BlueprintWorkspace.tsx` — `PERSONA_PROMPTS.builder`, `kore/execution/builder_session.py`

---

### Critic (ROLLE IV)
**Function**: Attacks implementations. Applies triage filter before emitting — same three-tier rule as Reviewer.

**Trigger**: Receives `DELTA` notification from Builder subagent. Reads only the delta, not the full codebase.

**Escalation rule**: Tier 1 and tier 2 failures route to the owning Builder subagent as `FAIL` notation. If the failure indicates an interface specification error (implementation was correct but interface was wrong), a single `FAIL` escalates to the Architect. This is the only time the Critic speaks to the Architect.

**Speaks to**: Builder subagents via `FAIL` notation. Architect via escalated interface failures only.

**Never speaks to**: Tester directly. Memory Keeper. Navigator. Forge.

**STATE obligation**: Writes `BLOCKED` for any tier 1 failure routing to Architect. Writes `READY` when all tier 1 and tier 2 issues resolved.

**Implemented in**: `src/renderer/components/BlueprintWorkspace.tsx` — `PERSONA_PROMPTS.critic`

---

### Tester (ROLLE IV)
**Function**: Validates that implementations meet behavioral guarantees. Emits verdicts to `STATE`.

**Verdict types**: `PASS`, `BLOCKED`, or `NEEDS-CALIBRATION`. Three states, not binary.

- `PASS`: All checks pass. Updates `STATE READY`.
- `BLOCKED`: Genuine behavioral gap. Confirms with Critic it is tier 1 or tier 2 before emitting. Tier 3 reclassified as `NEEDS-CALIBRATION`.
- `NEEDS-CALIBRATION`: Builder's self-check failed to catch something. Routes to Builder self-check as calibration signal — not to Architect. Module re-implemented with updated self-check. Full chain does not reblock.

**Speaks to**: `STATE` via verdicts. Builder self-check protocol via calibration signals. Critic via tier-confirmation requests.

**Never speaks to**: Architect. Reviewer. Navigator. Memory Keeper. Forge.

**STATE obligation**: Updates `BLOCKED` or `READY` after each verdict.

**Implemented in**: `src/renderer/components/BlueprintWorkspace.tsx` — `PERSONA_PROMPTS.tester`

---

### Memory Keeper (ROLLE V)
**Function**: Compressed signal feed for the Forge. Not a prose summarizer. Not a session log.

**Trigger**: Fires after each convergence — when `STATE` shows all `IN-PROGRESS` items moved to `READY` with no `BLOCKED` items remaining.

**Output format**: Four `ASSERT` statements only:
1. What converged
2. What blocked and was resolved
3. What blocked and remains open
4. What pattern recurred from a previous convergence

**Speaks to**: Forge only. Via compressed signal record.

**Never speaks to**: Any deliberation persona directly.

**STATE obligation**: None. Reads `STATE` to produce its signal record. Does not write to `STATE`.

**Implemented in**: `src/renderer/components/BlueprintWorkspace.tsx` — `PERSONA_PROMPTS.memoryKeeper`

---

### Forge — ΦΩΡGΕ
**Function**: Watches completed deliberations from one layer above. Proposes calibrations at the lowest possible intervention level. Applies to itself the same adversarial structure it enforces on everything else.

**Observation trigger**: Fires after every fifth convergence. Reads Memory Keeper signal records from the last five cycles.

**Four signals tracked**:
1. Convergence Velocity — average rounds per deliberation, trend direction
2. Round-Cap Failures — unresolved CHECK categories, recurring patterns
3. Navigator HARVEST Hit Rate — blind spots toward codebase areas
4. Post-Delivery Outcome Alignment — did open questions materialize as problems?

**Three intervention levels** — exhausts lower before escalating:
- Level 1 — Weight Adjustment: Priority Matrix weights, round cap, FAIL limit. No structural change. Immediately reversible.
- Level 2 — Prompt Calibration: Instruction language in system prompts. Reversible within one iteration.
- Level 3 — Protocol Modification: Add/remove keyword, injection point, convergence condition. Requires Reviewer approval.

**Proposal format**: One `ASSERT` stating the change. One `ASSERT` stating the metric it optimizes. One `ASSERT` stating the failure mode it guards against.

**Reviewer gate**: `FORGE-APPROVED` with one-line rationale, or `FORGE-BLOCKED` with specific metric-target divergence detected. Blocked proposals are logged as productive contradictions (RC5). Three consecutive blocks escalate as human review request.

**Speaks to**: Reviewer via Level 1/2/3 proposals. `STATE` via approved calibration updates.

**STATE obligation**: Writes approved calibrations to `LOCKED` after Reviewer approval.

**Implemented in**: `src/renderer/components/BlueprintWorkspace.tsx` — `FORGE_PROMPT`, `FORGE_REVIEWER_PROMPT`, `runForge()`, `deliberationLog[]`, `blockedProposals[]`

---

## Execution Flow — DAG, Not Sequence

```
Frame Lock fires
    ↓
Navigator GAP (injection 1) — check locked frame
    ↓
┌── Architect-Reviewer Hidden Loop (max 3 rounds) ──┐
│  Architect: ASSERT → PATCH → DELTA                  │
│  Navigator HARVEST (injection 2) — on each FAIL     │
│  Reviewer: FAIL → CHECK                             │
│  Convergence check → RESOLVED / cap / loop          │
└────────────────────────────────────────────────────┘
    ↓
Navigator full pass (injection 3) — GAP, HARVEST, REORDER
    ↓
Ratchet Score — if RC < 4, Gap Geometry fires
    ↓
Architect writes interfaces → STATE LOCKED
    ↓
Builder spawns subagents → STATE IN-PROGRESS
    ↓
┌── Parallel Subagent Execution ──┐
│  Self-check (2 passes)          │
│  DELTA → Critic                 │
│  Critic triage → FAIL or pass   │
│  Tester → PASS/BLOCKED/CALIB    │
│  STATE updates per module       │
└─────────────────────────────────┘
    ↓
Memory Keeper fires → Forge signal record
    ↓
Forge fires (every 5th convergence) → Reviewer gate → STATE LOCKED
```

---

## Hidden Cycles — Where They Fire

| Transition | Hidden Cycle | Rounds | Notation |
|-----------|-------------|--------|----------|
| Intent → Plan | Architect-Reviewer-Navigator | 3 max | ASSERT, FAIL, PATCH, CHECK, DELTA, GAP, HARVEST |
| Plan → Code | Builder 2-pass self-check | 2 passes | Internal — no emission on fail |
| Code → Review | Critic triage filter | 1 pass | FAIL (tier 1/2), tier 3 suppressed |
| Review → Test | Tester 3-state verdict | 1 pass | PASS, BLOCKED, NEEDS-CALIBRATION |
| Convergence → Evolution | Forge observation → Reviewer gate | 1 pass | FORGE-APPROVED, FORGE-BLOCKED |

---

## Cost Profile

| Operation | Token Cost | Frequency |
|-----------|-----------|-----------|
| STATE read | 10–20 | Per persona turn |
| STATE write | 5–15 | Per persona turn |
| Architect-Reviewer loop | 200–300 | Per user query (Plan mode) |
| Navigator injections | 60–80 | Per deliberation |
| Builder self-check | 50–100 | Per module |
| Critic triage | 30–50 | Per DELTA |
| Tester verdict | 20–40 | Per module |
| Memory Keeper signal | 40–60 | Per convergence |
| Forge observation | 100–150 | Per 5 convergences |
| **Total per user query** | **~500** | Includes hidden cycles |

---

## Implementation Slices

| # | Slice | Files Affected | Effort | Status |
|---|-------|---------------|--------|--------|
| 1 | Nine-keyword notation + STATE protocol in all persona prompts | `BlueprintWorkspace.tsx` | 1h | Ready |
| 2 | Architect-Reviewer-Navigator hidden loop with frame lock + delta rule | `BlueprintWorkspace.tsx` | 1h | **Done** (`Bua2a9dy`) |
| 3 | Builder subagent spawn protocol with STATE conflict detection | `BlueprintWorkspace.tsx` + `builder_session.py` | 2h | Pending |
| 4 | Per-persona hidden self-checks (Builder 2-pass, Critic triage, Tester 3-verdict) | `BlueprintWorkspace.tsx` | 2h | Pending |
| 5 | Memory Keeper as Forge data feed | `BlueprintWorkspace.tsx` | 0.5h | Pending |
| 6 | Forge observation cycle with Reviewer approval gate | `BlueprintWorkspace.tsx` | 2h | **Done** (`DjiIpgNW`) |

---

## Existing Code Mapping

| Spec Component | Code Location |
|---------------|---------------|
| Architect (planning) | `src/renderer/components/BlueprintWorkspace.tsx` — `ARCHITECT_SYSTEM_PROMPT` |
| Reviewer (planning) | `src/renderer/components/BlueprintWorkspace.tsx` — `REVIEWER_SYSTEM_PROMPT` |
| Navigator (Ask sub-mode) | `src/renderer/components/BlueprintWorkspace.tsx` — `NAVIGATOR_SYSTEM_PROMPT`, `runNavigator()` |
| Hidden Deliberation Loop | `src/renderer/components/BlueprintWorkspace.tsx` — `runDeliberation()`, `checkConvergence()`, `renderFinalPlan()` |
| 5-Persona Execute Pipeline | `src/renderer/components/BlueprintWorkspace.tsx` — `PERSONA_PROMPTS`, `executeBlueprintPlan()` |
| Forge Observation Cycle | `src/renderer/components/BlueprintWorkspace.tsx` — `runForge()`, `deliberationLog[]`, `blockedProposals[]` |
| Builder file writes | `kore/execution/builder_session.py` — `BuilderSession.run()` |
| Builder backend routing | `kore/execution/router.py` — `select_backend()` |
| kore-exec Rust binary | `kore-exec/src/main.rs` — `write_file`, `read_file`, `shell`, `grep`, `diff` |
| Agent LLM execution | `src/main/agent-executor.ts` — `executeAgent()` |
| IPC channels | `src/main/preload.ts` — `agent.execute`, `panels:*`, `jcode:send` |
| IdevaPersonas (source) | `BuildDocs/IdevaPersonas.md` — 5 ROLLE definitions |
| DysonAutoCode (source) | `BuildDocs/DysonAutoCode.md` — Sprint 5–8 architecture |
| jcode-kore-master-brief | `BuildDocs/jcode-kore-master-brief.md` — Routing matrix, gear sets |

---

## Ratchet Score

| RC | Condition | Satisfied |
|----|-----------|-----------|
| RC1 | Solves active tension | ✓ Relay race with dropped batons eliminated |
| RC2 | Near-zero reproduction cost | ✓ Prompting convention + STATE object |
| RC3 | Expands solution space | ✓ Parallel subagents, Forge self-improvement |
| RC4 | Contains teaching mechanism | ✓ Keyword set + STATE protocol self-documenting |
| RC5 | Generates productive contradictions | ✓ FORGE-BLOCKED proposals logged as seeds |
| RC6 | Embeds compression operator | ✓ Each hidden cycle reduces Kolmogorov complexity |
| RC7 | Substrate-independent | ✓ Runs on any LLM, agent framework, codebase |

**RC Score: 7/7**

---

## The Single Sentence

> The complete system is nine keywords, one STATE object, eight personas with explicit typed communication routes, parallel Builder subagents that are structurally drift-proof, hidden cycles at every persona transition that catch errors at the lowest possible layer, and a Forge that watches from above and improves the protocol itself — the relay race is gone, replaced by a self-converging network where the only thing that reaches the user is what has already survived every adversarial pass the system can generate.

---

## L6 Epistemic Architecture — Future Specifications

*Implemented: E1 Purpose Interrogator. E2-E8 are specified for future infrastructure.*

### E1 — Purpose Interrogator ✅
**Trigger**: Before Frame Lock (Plan mode).
**Function**: Three structural checks before any plan is locked — does this solve a real problem, does it create more complexity than it eliminates, is there a non-code solution? Emits `QUESTION` signal. Architect can override with single ASSERT. QUESTION log accumulates to reveal categories that consistently fail.
**Implemented**: `src/renderer/components/BlueprintWorkspace.tsx` — `PURPOSE_INTERROGATOR_PROMPT`, wired into `runDeliberation()` before Frame Lock.

### E2 — Ontology Builder (Future)
**Requires**: Persistent concept graph data structure.
**Function**: Maintains a living concept graph — nodes are domain concepts, edges are semantic relationships. After each convergence, reads WHY annotations and Invariant Registry additions. Detects when the same concept exists under different names (conceptual fragmentation). Navigator Gap Geometry checks concept graph for missing nodes.
**Dependencies**: E5 Intent Preservation (WHY records), Invariant Registry.

### E3 — Abstraction Synthesizer (Future)
**Requires**: E2 Ontology Builder.
**Function**: Finds pairs of concepts that share 3+ relationship types with a third concept but have no direct relationship — the signature of a missing abstraction. Emits `ABSTRACTION` signal. Architect decides whether to introduce it.
**Dependencies**: E2 Ontology Builder must exist first.

### E4 — Causal Reasoning Layer (Future)
**Requires**: Cross-signal analysis across convergence history.
**Function**: Before emitting any signal, asks whether the observed pattern has an identifiable cause that, if addressed, would eliminate the pattern rather than just flagging it. Transforms signals with identifiable causes into Forge Level 2 or 3 proposals automatically.
**Dependencies**: All signal-emitting surfaces.

### E5 — Ethical Constraint Layer (Future)
**Requires**: Consequence registry, consent model.
**Function**: Runs after modules involving user data, external communication, automated decisions, or resource allocation. Three questions: new surface for data access without consent? New surface for automated decisions without transparency? New surface for unequal resource allocation? Emits `CONSEQUENCE` signal.
**Dependencies**: Invariant Registry, consent configuration.

### E6 — Emergent Specification Engine (Future)
**Requires**: Runtime signal analysis (usage data, telemetry).
**Function**: Watches what the system builds and how it's used. Finds the shadow before the source — patterns of workarounds, repeated manual operations, recurring FAILs in a specific domain. Generates candidate specifications for capabilities no one requested but usage patterns imply are needed. Emits `EMERGENT` signal.
**Dependencies**: Runtime telemetry, usage data source.

### E7 — Civilizational Memory Layer (Future)
**Requires**: External knowledge source (compressed software architecture history).
**Function**: Compares Knowledge Crystallizer patterns against known software patterns, antipatterns, and abstractions that have been independently invented dozens of times. When resonance found, emits `RESONANCE` signal with historical context.
**Dependencies**: External knowledge base.

### E8 — Self-Modeling Layer (Future)
**Requires**: Persistent cognitive bias tracking data structure.
**Function**: System builds a model of its own cognitive patterns — which problems cause max deliberation rounds, which Forge proposals are consistently blocked, which Navigator GAP findings are consistently overridden. Feeds Confidence Annotator with systematic bias data. System knows where it's likely to be wrong before discovering it's wrong.
**Dependencies**: Persistent convergence history, bias tracking storage.

---

## Implementation Status — All Layers

| Layer | Surfaces | Implemented | Future |
|-------|----------|-------------|--------|
| Core (Slices 1-6) | Hidden deliberation, Forge, Subagents, Self-checks | 6/6 | — |
| Dyson Sphere (S1-S8) | 8 harvest surfaces | 8/8 | — |
| L5 Emergence (E1-E8) | 8 prospective surfaces | 8/8 | — |
| L6 Epistemic (E1-E8) | 8 knowledge surfaces | 1/8 | 7 future |
| **Total** | **30** | **23** | **7** |

### Build History

| Build | What |
|-------|------|
| `Bua2a9dy` | Hidden deliberation loop (Slices 2-6) |
| `DjiIpgNW` | Forge observation cycle |
| `5zdkbrbL` | 9-keyword + STATE protocol + Builder/Critic/Tester/MemoryKeeper v2 |
| `DsOWVlzL` | Parallel module pipelines (Builder+Critic+Tester subagents) |
| `oPpqpjgW` | 8 Dyson Sphere surfaces |
| `dbge1nA3` | 8 L5 emergence surfaces |
| `DozZW8Tq` | L6 E1 Purpose Interrogator |
| `C-7TGTe_` | Persona v2 restore + E3/E4/E7/E8 wiring |
