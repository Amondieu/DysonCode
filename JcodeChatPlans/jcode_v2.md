<img src="https://r2cdn.perplexity.ai/pplx-full-logo-primary-dark%402x.png" style="height:64px;margin-right:32px"/>

# just with text no html


---

# jcode Workflow Engine

## Token Optimization, Headroom \& Switchable Modes

### v2.0 — IDEVA Ω × ΣΚΟΠ × Dyson Sphere Applied


***

## PART 0 — FIELD COLLAPSE FIRST

**The real eigenstate, compressed to its irreducible form:**

Token cost is not a spending problem. It is a relevance filtering problem. Every wasted token is an unfiltered signal — stale state, repeated invariants, full-file dumps, dead conversation history — occupying space that should carry new information. The solution is never "spend less." It is "send less that matters more." One precise relevance gate collapses cost more than any speed optimization ever will. Find the token-wasting patterns before building the token-saving architecture. The shadow reveals the source.

**Three invariant constraints that govern everything below:**

1. Headroom is a governed gap, not an accident. Protect it actively.
2. Modes are context profiles, not model aliases. They configure the full stack.
3. The router removes cognitive load from the user. Routing should be invisible unless overridden.

***

## PART 1 — THE HEADROOM SYSTEM

### Definition

Headroom = the protected gap between what you fill and what the model's window can hold.

Most implementations waste 60–80% of context with stale state, repeated system prompts, full file dumps, and conversation turns that stopped being relevant three turns ago. Headroom management means that gap is actively governed — not accidentally large or accidentally small — so that high-importance new tokens always fit, low-importance old tokens are compressed or evicted first, and the model always receives maximum signal per token.

**The critical missing invariant from v1:** Headroom is not just a buffer. It is the primary quality control mechanism. When headroom collapses, output quality degrades before any error is thrown. The 10% warning threshold is not a soft suggestion — breach it and the model is already working on a degraded context.

### The 5-Layer Token Budget Architecture

Layer 5 — SYSTEM CORE (~2K tokens, frozen forever)

- Invariants, persona, output format
- Written once at session start. Never compressed. Never evicted.
- Content: the 12 Frozen Laws, role definition, output schema, ΣΚΟΠ entry rules
- Implementation note: on models supporting prompt caching (Claude 3.5, GPT-4o), this layer is cached by prefix after the first turn — its cost drops to near zero on all subsequent turns

Layer 4 — ACTIVE TASK FRAME (~4K tokens, session-locked)

- Current goal, active tensions, K-level state (invention level, mode, ΣΚΟΠ eigenstate)
- Replaced only when the task explicitly changes, not on every turn
- Loaded from SELF_STATE.yaml at task start, summarized to key decisions
- Missing invariant added: this layer must include the current mode ID and its token budget, so the model can self-regulate response length without being told externally

Layer 3 — WORKING MEMORY (~8K tokens, rolling window)

- Last N tool call results as a sliding window (N governed by current mode)
- Current file diffs only, never full files (see O1)
- Active reasoning chain compressed once per turn before the next turn begins
- Compression rule: one turn's reasoning chain → one decision + one outcome sentence

Layer 2 — EPISODIC BUFFER (~16K tokens, LRU-compressed)

- Conversation turns compressed to key decisions only
- Tool call history as outcome summaries, not full outputs
- Knowledge items relevant to the current task, relevance re-scored each turn
- Eviction order: oldest turns first, then least-recently-accessed knowledge items
- New invariant: a turn becomes eligible for compression after it is no longer in the working memory window AND its decision has been captured in the task frame

Layer 1 — HEADROOM RESERVE (remaining tokens, protected)

- Always kept free for the next turn's response
- Minimum reserve: 2× expected response length for current mode
- Alert threshold: warn if headroom falls below 10% of the full window
- Hard floor: never fill above 90% of window under any circumstance
- New invariant: the reserve floor scales with mode. FAST mode keeps 1K reserve. DEEP mode keeps 6K. AUDIT mode keeps 12K. The reserve must always fit the mode's max_tokens output budget.


### Headroom Manager — Upgraded Logic

Three core operations, each with a precision constraint v1 was missing:

**budget_report:** Count tokens per layer. Compute headroom and headroom percentage. Emit a warn flag if below threshold. New: emit a `mode_headroom_ok` boolean that checks whether current headroom exceeds the current mode's reserve floor — not just the global 10% threshold. These are different checks and both matter.

**compress_episodic:** Use a cheap local model (Qwen 0.5B or Phi-3 mini) for compression. Target: compress to half the current token count. Preserve: decisions made, values computed, errors found. Drop: reasoning chains, repeated context, intermediate steps that led nowhere. New precision: the compression prompt must specify the exact token target numerically, not as a fraction. A model given "max 400 tokens" compresses more reliably than one given "half."

**evict_lru:** Eviction order is fixed: episodic buffer first, then working memory. Never evict the task frame or system core. New invariant: before evicting, always attempt compression first. Eviction is irreversible within a session; compression preserves the semantic skeleton. Only evict if compression alone cannot reach the target headroom.

***

## PART 2 — TOKEN COST/EFFECTIVENESS OPTIMIZATIONS

### O1 — Differential Context (Highest ROI)

The problem: sending a full file on every turn when only 3 lines changed is a context-bloat archetype. It is the most common single source of waste in file-heavy workflows.

The fix: send only the git diff. A 3,000-token file with a 5-line change becomes a 50-token diff. Expected savings: 60–80% on any workflow involving file state.

Implementation rule: if the diff is empty, send `[no changes since last turn]` — 6 tokens. Never send the full file as a "just in case."

Missing invariant added: the diff must be anchored to the last turn's state, not to HEAD. If the user has staged but not committed, `git diff HEAD` misses the staged changes. Use `git diff` (unstaged) and `git diff --cached` (staged) and merge them. Or use `git diff HEAD` only after confirming the last model interaction committed or stashed.

### O2 — Tool Call Result Compression

Tool outputs are a secondary bloat source. A bash command returning 2,000 lines of log when the actionable content is 3 lines is a waste multiplier on every subsequent turn that carry that result.

The fix: compress tool output to actionable content before inserting it into context. Use a local tiny model for compression when the result exceeds the per-mode working memory budget for a single tool call.

Precision upgrade: the compression target should not be a fixed 200 tokens. It should be `min(200, mode_working_memory_per_item_budget)` where the per-item budget = working memory layer size ÷ max expected tool calls per turn. For FAST mode (1 turn of memory, disabled tool calls) this is irrelevant. For BALANCED mode (5 turns, tools enabled), the budget is approximately 8K ÷ 10 = 800 tokens per item, which is generous. For DEEP mode, 8K ÷ 20 = 400 tokens per item.

New invariant: compression must preserve error codes and stack traces verbatim. Compressing away a specific error message defeats the purpose. The compression prompt must explicitly say: preserve all error codes, stack traces, and numeric values exactly as they appear.

### O3 — System Prompt Hashing

The 12 Frozen Laws and IDEVA invariants are identical on every turn. Re-sending them costs the same as sending them fresh. On models with prefix caching, the first turn sends the full system core; every subsequent turn costs near zero for that prefix because the KV cache hit rate approaches 1.0 for identical prefixes.

The hash approach works correctly only when the system core is byte-for-byte identical across turns. Any whitespace normalization, dynamic timestamp injection, or per-turn personalization that modifies the system core breaks the cache hit and forces a full re-encode.

New invariant: the system core must be purely static. No dynamic content, no timestamps, no session IDs. If you need dynamic context, it belongs in Layer 4 (task frame), not Layer 5 (system core). A system core that includes `session_id: {uuid}` on every turn is not cacheable and should be restructured.

Supported models for prefix caching (as of 2026): Claude 3.5 Sonnet, Claude 3.5 Haiku, GPT-4o with the OpenAI prefix caching beta. For local models via Ollama, KV cache reuse is available but prefix matching is implementation-dependent — verify per runtime.

### O4 — Response Length Steering

Length budgets must be explicit per mode, injected into every prompt. The model does not know which mode it is in unless told. The task frame (Layer 4) now carries the current mode ID, and every prompt build step appends the appropriate length instruction.

Upgraded budget definitions:

- FAST: ≤50 words. No reasoning shown. Return only the answer or the next action.
- BALANCED: ≤200 words. Show key steps only. One reasoning sentence maximum.
- DEEP: ≤800 words. Full reasoning chain. Show tensions and alternatives considered.
- AUDIT: No length limit. Complete structured output. Every section of the audit schema must be populated.
- INVENTOR: ≤500 words per invention candidate. Each candidate must include: the invention, the constraint it removes, the category it opens.
- STEALTH: ≤200 words. No external references. No tool call descriptions.

New invariant: length budgets are not suggestions. They are contract terms. The prompt must say "You MUST stay within [N] words" not "Try to keep it to [N] words." The difference in compliance rate is significant.

### O5 — KV Cache Exploitation via Context Architecture

The model's KV cache reuses computation for identical prefix tokens. This means the ordering of context layers is not stylistic — it determines cache hit rate, which directly determines cost.

Stable content must come first. Dynamic content must come last. This is the single structural rule.

Correct layer order for the API call:

1. system_core (frozen, always cached after turn 1)
2. task_frame (session-locked, cached within a task)
3. working_memory (changes each turn — cache misses here, but this is unavoidable)
4. current_message (always new — always a cache miss)

Wrong layer order: injecting the current message before the task frame destroys cache coherence for everything that follows it. Even a one-token change in the current message invalidates the KV cache for all subsequent tokens in that position.

New invariant: never insert dynamic content between two stable layers. The stability gradient must be strictly decreasing from top to bottom. Any violation resets the cache for everything below the injection point.

***

## PART 3 — SWITCHABLE MODES

### Mode Architecture

Modes are complete context profiles. Each mode configures six dimensions simultaneously: model selection, context layers included and their depth, response length budget, tool call behavior, streaming behavior, and token budget ceiling.

A mode switch is a full stack reconfiguration, not a model alias. Switching from BALANCED to FAST without compressing the episodic buffer would send a FAST-sized context to a FAST model — which would then fail on context length. The switch_mode function must handle the downgrade path explicitly.

### The Six Modes

FAST — The Minimum Viable Signal Mode

- Purpose: quick lookup, search, single-fact retrieval
- Model: qwen2.5:7b (local), or GPT-4o-mini for cloud
- Temperature: 0.3
- Max response: 256 tokens
- Context layers: system_core only + last 1 turn of working memory
- Tool calls: disabled
- Token budget: 1,000
- Reserve floor: 1,000 tokens
- When to use: any intent starting with find / search / lookup / list / what is
- Downgrade path: compress episodic to zero, drop task frame

BALANCED — The Standard Work Mode

- Purpose: implementation, fixes, refactoring, standard feature work
- Model: qwen2.5:32b (local), or GPT-4o for cloud
- Temperature: 0.5
- Max response: 1,024 tokens
- Context layers: system_core + task_frame + last 5 turns + episodic compressed + relevant knowledge items
- Tool calls: enabled (all tools)
- Token budget: 8,000
- Reserve floor: 2,048 tokens
- When to use: any intent starting with implement / fix / update / refactor / add
- This is the default mode at session start

DEEP — The Full Reasoning Mode

- Purpose: architecture decisions, root cause analysis, design, complex explanation
- Model: deepseek-r1:70b (local), or Claude 3.5 Sonnet for cloud
- Temperature: 0.7
- Max response: 4,096 tokens
- Context layers: all layers at full depth + tension map + blindspot map
- Tool calls: enabled (all tools)
- Token budget: 32,000
- Reserve floor: 6,000 tokens
- When to use: any intent starting with why / analyze / design / architecture / explain
- Note: tension map and blindspot map are additional context objects generated at task-frame-load time, not on every turn

AUDIT — The Structured Verification Mode

- Purpose: repo audits, system state reports, verification passes
- Model: deepseek-r1:70b (local), or Claude 3.5 Sonnet for cloud
- Temperature: 0.1 (near-deterministic — audit outputs must be reproducible)
- Max response: 8,192 tokens
- Context layers: all layers, full manifest, full self_state
- Tool calls: enabled (all tools)
- Streaming: disabled (structured output must arrive complete for parsing)
- Output format: structured markdown with mandatory section headers
- Token budget: 64,000
- Reserve floor: 12,000 tokens
- When to use: any intent starting with audit / status / report / verify / check
- Critical invariant: AUDIT mode does not compress or evict anything during a session. It is a read-only diagnostic mode.

INVENTOR — The ΦΩΡGΕ Invention Mode

- Purpose: ideation, invention generation, tension-seeded exploration
- Model: deepseek-r1:70b (local), or Claude 3.5 Sonnet for cloud
- Temperature: 1.0 (maximum — invention requires exploratory variance)
- Max response: 2,048 tokens per candidate
- Context layers: system_core + task_frame + last 3 turns + episodic compressed + tension-seeded knowledge items + tension map + invention queue
- Tool calls: ΦΩΡGΕ tools only (concept_generation, invention_chain)
- Token budget: 12,000
- Reserve floor: 3,000 tokens
- When to use: any intent starting with invent / generate / create / ideate / brainstorm
- New invariant: the invention queue must be initialized from the active tension map, not from a blank slate. Inventions without a tension to resolve are decorations, not ratchets.

STEALTH — The Privacy-First Local Mode

- Purpose: sensitive work, proprietary code, zero-logging sessions
- Model: qwen2.5:14b (local only — no cloud routing under any circumstance)
- Temperature: 0.5
- Max response: 1,024 tokens
- Context layers: system_core + last 3 turns of working memory only
- Tool calls: disabled
- Logging: disabled at all layers
- Token budget: 4,000
- Reserve floor: 1,024 tokens
- Hard invariant: STEALTH mode cannot be auto-routed to. It must always be user-initiated via explicit /stealth command or UI button. Auto-routing from intent keywords must never select STEALTH. The user must consciously choose privacy mode.


### Mode Switching — Downgrade Invariants

When switching to a mode with a smaller token budget than the current mode, three operations must run in sequence before the new mode takes effect:

1. Compress the episodic buffer to fit within `new_mode_token_budget ÷ 4`
2. Trim the working memory window to the new mode's last-N-turns setting
3. Drop any context layers the new mode does not include

Failure to run these in order can result in a context that exceeds the new mode's budget ceiling on the very next turn. The switch is not complete until budget_report confirms `mode_headroom_ok = true`.

***

## PART 4 — INTENT-BASED AUTO-ROUTING

### The Routing Contract

The router has one job: collapse the user's required cognitive load to zero for mode selection in the common case, while preserving full manual override at all times.

The router runs on every incoming message before any other processing. It returns a suggested mode and a confidence score. If confidence is high (≥ 0.8) and the suggested mode differs from the current mode, the system may auto-switch — but must display a visible indicator that it did so (the mode button in the UI changes, and a one-line note appears: "Switched to DEEP for architecture query"). The user can override with a single click or a slash command.

### Intent-to-Mode Mapping

The mapping is keyword-triggered, not NLP-classified. Keywords are exact substring matches on the lowercased message, checked in order of specificity (longer keywords first to avoid the `what is` keyword firing on `what is the architecture`).

FAST triggers: find, search, lookup, list, what is, show me, where is, how many, which
BALANCED triggers: implement, fix, update, refactor, add, change, edit, write, build
DEEP triggers: why, analyze, design, architecture, explain, compare, evaluate, trade-off
AUDIT triggers: audit, status, report, verify, check, review, scan, inspect
INVENTOR triggers: invent, generate, create, ideate, brainstorm, imagine, propose, explore

No trigger → current mode preserved, confidence 0.0.

### Slash Command Override

The slash command always wins. It takes priority over auto-routing, over the current mode, and over any auto-routing suggestion. Pattern: `/fast`, `/balanced`, `/deep`, `/audit`, `/inventor`, `/stealth`.

The command is consumed before message processing — it does not appear in the model's context. The mode switch runs its downgrade invariants if required, then the remaining message text (after the slash command) is processed under the new mode.

### The Missing Invariant: Routing Feedback Loop

v1 had no mechanism to learn from routing errors. New addition: when the user manually overrides an auto-routing suggestion, log the original intent text and the user's chosen mode as a correction pair. After 10 correction pairs accumulate, surface a prompt: "Your routing preferences seem to differ from the defaults. Would you like to update your routing profile?" This is the minimum viable autopoietic loop — the router improves from use.

***

## PART 5 — FIXPOINT VERIFICATION

A system passes fixpoint check when applying the system to itself produces the same system.

For jcode: run the headroom manager on the jcode workflow engine's own context. If the system can govern its own token budget using its own tools, the fixpoint condition is satisfied. If it cannot — if the system prompt + task frame + working memory for a standard BALANCED session already exceeds 8,000 tokens — the architecture is self-contradictory and must be compressed before deployment.

Target fixpoint state: a fresh BALANCED session with system_core + task_frame loaded should consume no more than 6,000 tokens, leaving 2,000 of headroom reserve before the first user message arrives. If this condition is not met, compress the system core or the task frame template until it is.

**Ratchet Conditions Met by This Architecture:**

- RC1: Solves the active tension of context bloat, which is the primary cost driver in LLM workflows
- RC2: Near-zero reproduction cost — the architecture is a set of Python files and configuration objects
- RC3: The mode system opens new problem classes (privacy-first local workflows, structured audit passes) not solvable by a single-mode system
- RC4: The headroom manager teaches its own method — the budget_report output is human-readable and self-explaining
- RC5: The routing feedback loop seeds its own successor by accumulating correction data
- RC6: Every optimization (O1–O5) embeds a compression operator on the token domain

RC score: 6 of 7. Permanent ratchet. Civilizational level requires substrate-independence — that requires the system to port cleanly to any model provider without code changes. That is the one remaining upgrade to reach RC7.

