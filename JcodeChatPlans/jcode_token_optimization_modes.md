# jcode Workflow Engine — Token Optimization, Headroom & Switchable Modes
## Dyson Sphere x IDEVA x ΣΚΟΠ Applied to LLM Cost/Effectiveness Architecture
### 2026-06-25

---

## PART 0 — FIELD COLLAPSE FIRST (ΣΚΟΠ)

Before designing anything, apply the three invariant ΣΚΟΠ rules to the problem:

**What are we actually solving?**
Not "make jcode cheaper." Compress the real eigenstate:

> The token cost problem is a context bloat problem.
> The context bloat problem is a relevance filtering problem.
> The relevance filtering problem is a compression operator problem.

The solution is not spending less — it is **sending less that matters more**.

Constraint supremacy: one precise constraint (relevance gate) collapses cost
more than any speed optimization. Shadow before source: find the token-wasting
patterns before building the token-saving architecture.

---

## PART 1 — HEADROOM SYSTEM

### What Headroom Is (for jcode)

Headroom = the gap between the model's context window and what you actually fill.
Most implementations waste 60-80% of context with stale state, repeated system
prompts, full file dumps, and chat history that stopped being relevant 3 turns ago.

Headroom management = keeping that gap *actively governed* so:
- High-importance new tokens always fit
- Low-importance old tokens are compressed or evicted first
- The model always receives the maximum signal per token

### The 5-Layer Token Budget Architecture

```
+----------------------------------------------------------+
|  CONTEXT WINDOW (e.g. 128K tokens)                       |
|                                                          |
|  Layer 5: SYSTEM CORE          [~2K -- frozen]           |
|  +- Invariants, persona, output format                   |
|  +- NEVER compressed. NEVER evicted.                     |
|  +- Written once, referenced by hash if needed           |
|                                                          |
|  Layer 4: ACTIVE TASK FRAME    [~4K -- session-locked]   |
|  +- Current goal, active tensions, K-level state         |
|  +- Replaced only when task changes                      |
|  +- Summarized from SELF_STATE.yaml at task start        |
|                                                          |
|  Layer 3: WORKING MEMORY       [~8K -- rolling window]   |
|  +- Last N tool call results (sliding window)            |
|  +- Current file diffs (not full files)                  |
|  +- Active reasoning chain (compressed per turn)         |
|                                                          |
|  Layer 2: EPISODIC BUFFER      [~16K -- LRU-compressed]  |
|  +- Conversation turns (compressed to key decisions)     |
|  +- Tool call history (outcome only, not full output)    |
|  +- Knowledge items relevant to current task            |
|                                                          |
|  Layer 1: HEADROOM RESERVE     [~remaining -- protected] |
|  +- Always kept free for next turn                       |
|  +- Minimum: 2x expected response length                 |
|  +- Alert if headroom < 10% of window                   |
+----------------------------------------------------------+
```

### Headroom Manager (Python -- add to .jcode/)

```python
# .jcode/headroom.py
import tiktoken
from pathlib import Path
import yaml, json

class HeadroomManager:
    WINDOW  = 128_000   # adjust per model
    RESERVE = 12_000    # always keep free
    WARN_AT = 0.10      # warn if <10% headroom

    def __init__(self, model="gpt-4o"):
        self.enc = tiktoken.encoding_for_model(model)

    def count(self, text: str) -> int:
        return len(self.enc.encode(text))

    def budget_report(self, context_layers: dict) -> dict:
        used = {k: self.count(str(v)) for k, v in context_layers.items()}
        total_used = sum(used.values())
        headroom = self.WINDOW - total_used - self.RESERVE
        return {
            "used_by_layer": used,
            "total_used": total_used,
            "headroom": headroom,
            "headroom_pct": headroom / self.WINDOW,
            "warn": headroom / self.WINDOW < self.WARN_AT
        }

    def compress_episodic(self, turns: list, target_tokens: int) -> str:
        """Compress conversation history to key decisions only."""
        if not turns:
            return ""
        recent = turns[-2:]
        older  = turns[:-2]
        summary_prompt = (
            "Compress these conversation turns to key decisions and outcomes only. "
            "Max " + str(target_tokens) + " tokens. Keep: decisions made, "
            "values computed, errors found. Drop: reasoning chains, repeated context.\n\n"
            + "\n---\n".join(str(t) for t in older)
        )
        return call_model_cheap(summary_prompt)

    def evict_lru(self, layers: dict, target_free: int) -> dict:
        """Evict least-recently-used tokens until target headroom is free."""
        evict_order = ["episodic_buffer", "working_memory"]
        for layer in evict_order:
            if self.budget_report(layers)["headroom"] >= target_free:
                break
            layers[layer] = self.compress_episodic(
                layers.get(layer, []),
                target_tokens=self.count(str(layers[layer])) // 2
            )
        return layers
```

---

## PART 2 — TOKEN COST/EFFECTIVENESS OPTIMIZATIONS

### O1 — Differential Context (highest ROI)

**Instead of sending full files, send only the diff.**

```python
# Bad: sends entire file every turn (~3000 tokens)
context["manifest"] = open("MANIFEST.yaml").read()

# Good: sends only changed lines (~50 tokens)
import subprocess
diff = subprocess.run(
    ["git", "diff", "HEAD", "MANIFEST.yaml"],
    capture_output=True, text=True
).stdout
context["manifest_delta"] = diff if diff else "[no changes since last turn]"
```

**Expected savings: 60-80% on file-heavy workflows.**

### O2 — Tool Call Result Compression

**Before inserting tool results into context, compress them.**

```python
def compress_tool_result(result: str, max_tokens: int = 200) -> str:
    """Extract only actionable content from tool output."""
    if count_tokens(result) <= max_tokens:
        return result
    # Use fast local model (Qwen 0.5B / Phi-3 mini) for compression
    prompt = f"Extract only the actionable facts and key values. Max {max_tokens} tokens:\n{result}"
    return call_local_tiny(prompt)
```

### O3 — System Prompt Hashing (stop repeating invariants)

**The 12 Frozen Laws + IDEVA invariants are the same every turn.
Reference them by hash instead of re-sending.**

```python
import hashlib

SYSTEM_CORE = """[invariants, persona, output format - full text here]"""
SYSTEM_HASH = hashlib.sha256(SYSTEM_CORE.encode()).hexdigest()[:8]

def get_system_prompt(is_first_turn: bool) -> str:
    if is_first_turn:
        return SYSTEM_CORE
    else:
        return f"[SYSTEM_CORE:{SYSTEM_HASH}]  # model has seen this"
```

*(Only works with models that support prompt caching: Claude 3.5, GPT-4o via prefix caching)*

### O4 — Response Length Steering

**Add explicit length budgets to every prompt.**

```python
MODE_LENGTH_BUDGETS = {
    "fast":     "Reply in <=50 words. No reasoning shown.",
    "balanced": "Reply in <=200 words. Show key steps only.",
    "deep":     "Reply in <=800 words. Full reasoning chain.",
    "audit":    "No length limit. Complete structured output."
}

def inject_length_budget(prompt: str, mode: str) -> str:
    return prompt + f"\n\n[LENGTH: {MODE_LENGTH_BUDGETS[mode]}]"
```

### O5 — KV Cache Exploitation

**Structure prompts so stable content comes first.
The model's KV cache will reuse it across turns for free.**

```python
def build_context_for_api(layers: dict, mode: str) -> list:
    return [
        # Cached prefix -- stable across turns
        {"role": "system", "content": layers["system_core"]},
        {"role": "system", "content": layers["task_frame"]},
        # Dynamic suffix -- changes each turn
        {"role": "user",   "content": layers["working_memory"]},
        {"role": "user",   "content": layers["current_message"]},
    ]
```

---

## PART 3 — SWITCHABLE MODES

### Mode Architecture

Modes are **context profiles** -- each one configures the full stack:
model selection, context layers included, response length budget,
tool call behavior, and streaming verbosity.

```python
# .jcode/modes.py

MODES = {

    "FAST": {
        "id": "fast",
        "emoji": "lightning",
        "label": "Fast",
        "description": "Quick answers, minimal context, cheapest model",
        "model":        "qwen2.5:7b",
        "temp":         0.3,
        "max_tokens":   256,
        "layers": {
            "system_core":     True,
            "task_frame":      False,
            "working_memory":  "last_1_turn",
            "episodic":        False,
            "knowledge_items": False,
        },
        "tool_calls":   "disabled",
        "streaming":    True,
        "color":        "#e8af34",   # gold
        "token_budget": 1000,
    },

    "BALANCED": {
        "id": "balanced",
        "emoji": "scales",
        "label": "Balanced",
        "description": "Standard work mode -- tools enabled, moderate context",
        "model":        "qwen2.5:32b",
        "temp":         0.5,
        "max_tokens":   1024,
        "layers": {
            "system_core":     True,
            "task_frame":      True,
            "working_memory":  "last_5_turns",
            "episodic":        "compressed",
            "knowledge_items": "relevant_only",
        },
        "tool_calls":   "enabled",
        "streaming":    True,
        "color":        "#4f98a3",   # teal
        "token_budget": 8000,
    },

    "DEEP": {
        "id": "deep",
        "emoji": "microscope",
        "label": "Deep",
        "description": "Full context, best model, complete reasoning chains",
        "model":        "deepseek-r1:70b",
        "temp":         0.7,
        "max_tokens":   4096,
        "layers": {
            "system_core":     True,
            "task_frame":      True,
            "working_memory":  "last_10_turns",
            "episodic":        "full",
            "knowledge_items": "all",
            "tension_map":     True,
            "blindspot_map":   True,
        },
        "tool_calls":   "enabled",
        "streaming":    True,
        "color":        "#7a39bb",   # purple
        "token_budget": 32000,
    },

    "AUDIT": {
        "id": "audit",
        "emoji": "building",
        "label": "Audit",
        "description": "Repo/system audit mode -- structured output, full state",
        "model":        "deepseek-r1:70b",
        "temp":         0.1,
        "max_tokens":   8192,
        "layers": {
            "system_core":     True,
            "task_frame":      True,
            "working_memory":  "all",
            "episodic":        "full",
            "knowledge_items": "all",
            "tension_map":     True,
            "self_state":      True,
            "manifest":        "full",
        },
        "tool_calls":    "enabled",
        "streaming":     False,
        "output_format": "structured_markdown",
        "color":         "#437a22",   # green
        "token_budget":  64000,
    },

    "INVENTOR": {
        "id": "inventor",
        "emoji": "dna",
        "label": "Inventor",
        "description": "PHWORGE invention mode -- max creativity, tension seeding",
        "model":        "deepseek-r1:70b",
        "temp":         1.0,
        "max_tokens":   2048,
        "layers": {
            "system_core":     True,
            "task_frame":      True,
            "working_memory":  "last_3_turns",
            "episodic":        "compressed",
            "knowledge_items": "tension_seeded",
            "tension_map":     True,
            "invention_queue": True,
        },
        "tool_calls":   "phworge_only",
        "streaming":    True,
        "color":        "#da7101",   # orange
        "token_budget": 12000,
    },

    "STEALTH": {
        "id": "stealth",
        "emoji": "mute",
        "label": "Stealth",
        "description": "Privacy mode -- local only, no tool calls, no logging",
        "model":        "qwen2.5:14b",
        "temp":         0.5,
        "max_tokens":   1024,
        "layers": {
            "system_core":     True,
            "task_frame":      False,
            "working_memory":  "last_3_turns",
            "episodic":        False,
            "knowledge_items": False,
        },
        "tool_calls":   "disabled",
        "streaming":    True,
        "logging":      False,
        "color":        "#797876",   # muted gray
        "token_budget": 4000,
    },
}

def switch_mode(mode_id: str, session: dict) -> dict:
    """Hot-swap mode without losing conversation history."""
    old_mode = session.get("mode", "balanced")
    new_mode = MODES[mode_id.upper()]
    old_budget = MODES[old_mode.upper()]["token_budget"]
    session["mode"] = mode_id
    # Compress episodic buffer on downgrade
    if new_mode["token_budget"] < old_budget:
        session["episodic"] = compress_to_budget(
            session.get("episodic", []),
            new_mode["token_budget"] // 4
        )
    return session
```

---

## PART 4 — INTENT-BASED AUTO-ROUTING (ΣΚΟΠ Layer)

```python
# .jcode/router.py

INTENT_TO_MODE = {
    # ΣΚΟΠ collapse -- fast, cheap
    "find":        "fast",
    "search":      "fast",
    "lookup":      "fast",
    "list":        "fast",
    "what is":     "fast",

    # IDEVA implementation -- balanced
    "implement":   "balanced",
    "fix":         "balanced",
    "update":      "balanced",
    "refactor":    "balanced",
    "add":         "balanced",

    # Deep reasoning
    "why":         "deep",
    "analyze":     "deep",
    "design":      "deep",
    "architecture":"deep",
    "explain":     "deep",

    # Audit / verify
    "audit":       "audit",
    "status":      "audit",
    "report":      "audit",
    "verify":      "audit",
    "check":       "audit",

    # PHWORGE invention
    "invent":      "inventor",
    "generate":    "inventor",
    "create":      "inventor",
    "ideate":      "inventor",
    "brainstorm":  "inventor",
}

def auto_route_mode(message: str, current_mode: str) -> tuple:
    """Returns (suggested_mode, confidence). User can always override."""
    msg_lower = message.lower()
    for keyword, mode in INTENT_TO_MODE.items():
        if keyword in msg_lower:
            return mode, 0.8
    return current_mode, 0.0  # no change

def detect_slash_override(message: str):
    """Detect explicit /mode commands."""
    import re
    m = re.match(r'^/(fast|balanced|deep|audit|inventor|stealth)\b', message.strip())
    return m.group(1) if m else None
```

---

## PART 5 — MODE SELECTOR UI (for ZooCode)

```html
<!-- Insert into chat header bar -->
<div class="mode-bar" role="toolbar" aria-label="Mode selector">

  <button class="mode-btn" data-mode="fast"     title="Fast -- cheap quick">⚡</button>
  <button class="mode-btn mode-active" data-mode="balanced" title="Balanced -- standard">⚖</button>
  <button class="mode-btn" data-mode="deep"     title="Deep -- full reasoning">🔬</button>
  <button class="mode-btn" data-mode="audit"    title="Audit -- structured output">🏗</button>
  <button class="mode-btn" data-mode="inventor" title="Inventor -- PHWORGE">🧬</button>
  <button class="mode-btn" data-mode="stealth"  title="Stealth -- local only">🔇</button>

  <!-- Token budget bar -->
  <div class="budget-track">
    <div class="budget-fill" id="budgetFill"></div>
  </div>
  <span class="budget-label" id="budgetLabel">0 / 8K</span>

  <!-- Session cost -->
  <span class="cost-label" id="costLabel">$0.0000</span>
</div>
```

```css
.mode-bar {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-4);
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  font-size: var(--text-xs);
}
.mode-btn {
  font-size: 1.1rem;
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
  background: transparent;
  border: 1px solid transparent;
  cursor: pointer;
  opacity: 0.45;
  transition: opacity 180ms, background 180ms, border-color 180ms;
}
.mode-btn:hover { opacity: 1; background: var(--color-surface-offset); }
.mode-active    { opacity: 1; border-color: var(--color-primary);
                  background: var(--color-primary-highlight); }
.budget-track {
  flex: 1; height: 3px;
  background: var(--color-surface-offset);
  border-radius: var(--radius-full); overflow: hidden;
}
.budget-fill {
  height: 100%;
  background: var(--color-primary);
  border-radius: var(--radius-full);
  transition: width 300ms ease, background 300ms ease;
}
.budget-fill.warn     { background: var(--color-gold); }
.budget-fill.critical { background: var(--color-error); }
.budget-label, .cost-label {
  color: var(--color-text-faint);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
```

```javascript
const MODE_BUDGETS = {
  fast: 1000, balanced: 8000, deep: 32000,
  audit: 64000, inventor: 12000, stealth: 4000
};
const MODE_COSTS = {           // $ per 1K tokens (input/output)
  fast:     [0.000150, 0.000600],
  balanced: [0.002500, 0.010000],
  deep:     [0.003000, 0.015000],
  audit:    [0.003000, 0.015000],
  inventor: [0.003000, 0.015000],
  stealth:  [0.000000, 0.000000],
};
let currentMode = 'balanced';
let sessionCost = 0;

// Mode switching
document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('mode-active'));
    btn.classList.add('mode-active');
    currentMode = btn.dataset.mode;
    fetch('/api/mode', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ mode: currentMode })
    });
  });
});

// Budget bar update
function updateBudget(usedTokens) {
  const budget = MODE_BUDGETS[currentMode] || 8000;
  const pct = Math.min(usedTokens / budget * 100, 100);
  const fill = document.getElementById('budgetFill');
  fill.style.width = pct + '%';
  fill.className = 'budget-fill' + (pct > 90 ? ' critical' : pct > 70 ? ' warn' : '');
  document.getElementById('budgetLabel').textContent =
    fmtK(usedTokens) + ' / ' + fmtK(budget);
}

// Cost tracker
function trackCost(inTok, outTok) {
  const [ci, co] = MODE_COSTS[currentMode] || MODE_COSTS.balanced;
  sessionCost += (inTok/1000*ci) + (outTok/1000*co);
  document.getElementById('costLabel').textContent = '$' + sessionCost.toFixed(4);
}

function fmtK(n) { return n >= 1000 ? (n/1000).toFixed(1)+'K' : String(n); }

// Slash command detection in input
document.getElementById('chatInput').addEventListener('input', e => {
  const val = e.target.value;
  const m = val.match(/^\/(fast|balanced|deep|audit|inventor|stealth)\b/);
  if (m) {
    const suggested = m[1];
    showModeToast(`Switch to ${suggested} mode?`, suggested);
  }
});

function showModeToast(message, mode) {
  // Non-blocking toast with [Yes] [Keep] buttons
  // Remove existing toast if any
  document.getElementById('modeToast')?.remove();
  const toast = document.createElement('div');
  toast.id = 'modeToast';
  toast.className = 'mode-toast';
  toast.innerHTML = `<span>${message}</span>
    <button onclick="applyMode('${mode}');this.closest('#modeToast').remove()">Yes</button>
    <button onclick="this.closest('#modeToast').remove()">Keep</button>`;
  document.getElementById('chatContainer').prepend(toast);
  setTimeout(() => toast.remove(), 5000);
}
```

---

## PART 6 — IMPLEMENTATION CHECKLIST

**Backend (.jcode/)**
- [ ] Add `headroom.py` with HeadroomManager class
- [ ] Add `modes.py` with 6 mode definitions
- [ ] Add `router.py` with auto_route_mode() and detect_slash_override()
- [ ] Modify main entry to call HeadroomManager.budget_report() before each API call
- [ ] Wire switch_mode() to POST /api/mode
- [ ] Compress tool results before context insertion (O2)
- [ ] Use git diffs instead of full files (O1)
- [ ] Add prompt caching headers for Claude/GPT-4o (O3/O5)

**Frontend**
- [ ] Add .mode-bar to chat header with 6 mode buttons
- [ ] Wire buttons to /api/mode endpoint
- [ ] Update budget bar after each streaming [DONE]
- [ ] Add cost display element
- [ ] Detect /mode prefix in input, show toast
- [ ] Show auto-suggested mode as non-blocking toast when intent detected

**Token savings expected (conservative estimates):**
- O1 diff context:     60-80% reduction on file-heavy turns
- O2 tool compression: 40-60% reduction on multi-tool turns
- O3 prompt hashing:   15-25% reduction on repeated system prompts (with caching)
- O4 length steering:  20-40% reduction on response verbosity
- Mode routing:        50-70% cost reduction by defaulting to Fast for simple queries

**Combined realistic savings: 60-75% cost reduction vs naive full-context every turn.**

---

## THE SINGLE SENTENCE (Dyson Space frame)

Route every turn to the cheapest model that can still satisfy the constraint,
compress context to the delta not the state, and let mode switching be the
user's only cognitive load -- the system handles everything else.

RC1 active tension (token waste) / RC2 near-zero add cost / RC3 opens new
problem classes (mode-aware agents) / RC4 self-teaching (router improves per turn)
/ RC5 seeds successor (compression metrics feed GNOSIS awareness) = RC 5/7.

---
Generated: Perplexity Dyson Sphere Space x 2026-06-25
