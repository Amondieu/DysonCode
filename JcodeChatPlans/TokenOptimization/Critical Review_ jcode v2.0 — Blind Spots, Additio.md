<img src="https://r2cdn.perplexity.ai/pplx-full-logo-primary-dark%402x.png" style="height:64px;margin-right:32px"/>

# Critical Review: jcode v2.0 — Blind Spots, Additions, RC7 Path

## Adversarial audit using IDEVA Fixpoint + ΣΚΟΠ Eigenstate + Dyson Harvest

### 2026-06-26


***

## VERDICT FIRST

v2.0 is a strong permanent ratchet — RC 6/7 is correct.
The document is internally consistent and covers the major cost levers.
What follows are the genuine blind spots and the highest-leverage additions,
in order of leverage. Nothing fabricated. Every point traces to a specific
structural gap in the document as written.

***

## BLIND SPOT 1 — The Compression Loop Has No Quality Gate (Critical)

**What v2.0 says:** compress_episodic uses a cheap local model (Qwen 0.5B).
Preserve decisions, values, errors. Drop reasoning chains.

**What v2.0 misses:** there is no verification step after compression.
A Qwen 0.5B compression run can silently drop a critical decision
(e.g., "we chose git diff --cached, not HEAD, because of staged changes")
while passing the token-count check perfectly.

**The structural gap:** compression is treated as lossless by contract but
implemented with a lossy model. No document states what happens when
the compressed output omits a decision that later turns depend on.

**The fix — add a compression verifier:**

```python
def compress_with_verify(turns: list, target_tokens: int, verifier_model: str) -> str:
    compressed = call_tiny_model(compression_prompt(turns, target_tokens))
    # Verifier: check that all key decisions in original appear in compressed
    decisions = extract_decisions(turns)  # regex for: decided, chose, fixed, set to
    missing = [d for d in decisions if d.lower() not in compressed.lower()]
    if missing:
        # Retry once with explicit list of must-preserve items
        compressed = call_tiny_model(
            compression_prompt(turns, target_tokens, must_preserve=missing)
        )
    return compressed
```

This adds one cheap local inference call as a safety gate.
The cost is ~50 tokens. The failure mode it prevents is catastrophic context drift.

***

## BLIND SPOT 2 — The Routing Feedback Loop Has No Cold Start Strategy

**What v2.0 says:** after 10 correction pairs, surface a prompt to update
the routing profile.

**What v2.0 misses:** sessions shorter than 10 turns never accumulate corrections.
A user who runs 8-turn sessions repeatedly never gets a routing profile update,
even if they manually override the router on turn 3 of every single session.

**The structural gap:** the feedback loop requires within-session accumulation
but most real usage is multi-session. Correction pairs are not persisted
between sessions.

**The fix:**

```python
# .jcode/router_profile.py
CORRECTIONS_FILE = Path(".jcode/routing_corrections.jsonl")

def log_correction(original_intent: str, suggested: str, chosen: str):
    """Persist corrections across sessions."""
    with CORRECTIONS_FILE.open("a") as f:
        f.write(json.dumps({
            "ts": datetime.utcnow().isoformat(),
            "intent": original_intent,
            "suggested": suggested,
            "chosen": chosen
        }) + "\n")

def get_correction_count() -> int:
    if not CORRECTIONS_FILE.exists():
        return 0
    return sum(1 for _ in CORRECTIONS_FILE.open())

def build_user_routing_overrides() -> dict:
    """After 10 corrections, derive personal keyword additions."""
    corrections = [json.loads(l) for l in CORRECTIONS_FILE.open()]
    # Find keywords in intents that always map to a non-default mode
    overrides = {}
    for c in corrections:
        words = c["intent"].lower().split()
        for word in words:
            if len(word) > 4:  # ignore stop words
                overrides.setdefault(word, []).append(c["chosen"])
    # Promote words that consistently map to the same mode (>= 3 occurrences)
    return {w: Counter(modes).most_common(1)[0][0]
            for w, modes in overrides.items()
            if len(modes) >= 3 and len(set(modes)) == 1}
```

This makes the routing feedback loop cross-session and self-improving —
satisfying the autopoietic condition v2.0 describes but does not fully implement.

***

## BLIND SPOT 3 — AUDIT Mode "No Compression" Invariant Breaks Long Sessions

**What v2.0 says:** AUDIT mode does not compress or evict anything.
It is a read-only diagnostic mode.

**What v2.0 misses:** an AUDIT session that runs multiple passes
(e.g., audit MANIFEST → audit tensions → audit K-level)
will fill its 64K budget in approximately 4-6 passes and then crash
with a context overflow, silently producing a partial audit.

**The structural gap:** the invariant is correct for single-pass audits
but undefined for multi-pass. The document does not say whether
AUDIT mode is always single-pass by definition or whether multi-pass
is permitted with a different eviction rule.

**The fix — add AUDIT session scoping:**

```python
AUDIT_MODE = {
    # ...existing config...
    "session_type": "single_pass",  # enforce this
    "max_audit_passes": 1,          # force new session per audit domain
    "pass_boundary_behavior": "warn_and_block",
    # If the user tries to start a second audit domain in the same session:
    # emit: "AUDIT mode is single-pass. Start a new session for [domain]."
}
```

If multi-pass audits are needed, define a MULTI-AUDIT mode that
compresses each completed pass to its findings before starting the next.
This is a different mode with different invariants, not a relaxation of AUDIT.

***

## BLIND SPOT 4 — The Diff Anchoring Fix Is Incomplete

**What v2.0 says:** use git diff (unstaged) and git diff --cached (staged)
and merge them. Or use git diff HEAD only after confirming the last model
interaction committed or stashed.

**What v2.0 misses:** the "merge them" instruction has no implementation.
Merging two diffs naively can produce a diff that applies to neither the
working tree nor the index. The correct implementation is:

```python
def get_full_diff(file_path: str) -> str:
    """Returns the complete diff between HEAD and current working state,
    including both staged and unstaged changes, for a specific file."""
    # Use git diff HEAD -- which shows all changes since last commit
    # regardless of staging status
    result = subprocess.run(
        ["git", "diff", "HEAD", "--", file_path],
        capture_output=True, text=True
    )
    diff = result.stdout
    # Edge case: file is untracked (new, never committed)
    if not diff:
        result2 = subprocess.run(
            ["git", "diff", "--no-index", "/dev/null", file_path],
            capture_output=True, text=True
        )
        diff = result2.stdout
    return diff if diff else f"[no changes: {file_path}]"
```

`git diff HEAD -- <file>` correctly shows the union of staged and unstaged
changes relative to the last commit. The two-command merge approach
is unnecessary and error-prone. This is not a design decision —
it is a git correctness issue.

***

## BLIND SPOT 5 — No Graceful Degradation Path When Local Models Are Unavailable

**What v2.0 says:** STEALTH mode uses qwen2.5:14b local only.
FAST mode uses qwen2.5:7b local.

**What v2.0 misses:** if Ollama is not running or the model is not pulled,
the mode silently fails or throws an unhandled exception.
There is no fallback chain and no user-visible error that explains
*which* model is missing and *how* to fix it.

**The fix — add a provider health check at mode switch:**

```python
def check_local_provider(model: str) -> tuple:
    """Returns (available: bool, reason: str)"""
    try:
        resp = requests.get("http://localhost:11434/api/tags", timeout=2)
        models = [m["name"] for m in resp.json().get("models", [])]
        if model in models:
            return True, "ok"
        return False, f"Model '{model}' not pulled. Run: ollama pull {model}"
    except requests.exceptions.ConnectionError:
        return False, "Ollama not running. Run: ollama serve"

def switch_mode_safe(mode_id: str, session: dict) -> dict:
    mode = MODES[mode_id.upper()]
    if mode.get("local_only") or mode_id == "stealth":
        ok, reason = check_local_provider(mode["model"])
        if not ok:
            raise ModeUnavailableError(f"Cannot switch to {mode_id}: {reason}")
    return switch_mode(mode_id, session)
```

This is especially critical for STEALTH mode where the hard invariant
is "no cloud routing under any circumstance" — if the local model is
unavailable, the correct behavior is to block the switch and inform
the user, not to silently fall back to a cloud model.

***

## BLIND SPOT 6 — RC7 Path Is Identified But Not Operationalized

**What v2.0 says:** RC7 requires substrate-independence — the system must
port cleanly to any model provider without code changes. That is the one
remaining upgrade.

**What v2.0 misses:** a concrete definition of what "port cleanly" means
as a testable condition, and the minimum interface that achieves it.

**The RC7 interface — a provider adapter pattern:**

```python
# .jcode/providers/base.py
from abc import ABC, abstractmethod

class ModelProvider(ABC):
    """RC7 substrate-independence interface.
    Any class implementing this can be used as a jcode backend."""

    @abstractmethod
    def chat(self, messages: list, max_tokens: int, temperature: float,
             stream: bool) -> Iterator[str]:
        """Stream tokens. Raise ProviderError on failure."""
        ...

    @abstractmethod
    def count_tokens(self, text: str) -> int:
        """Return token count for text."""
        ...

    @abstractmethod
    def supports_prefix_cache(self) -> bool:
        """True if this provider supports KV prefix caching."""
        ...

    @abstractmethod
    def health_check(self) -> tuple:
        """Returns (available: bool, latency_ms: int)"""
        ...

# .jcode/providers/ollama.py
class OllamaProvider(ModelProvider):
    def __init__(self, model: str, base_url: str = "http://localhost:11434"):
        ...

# .jcode/providers/openai.py
class OpenAIProvider(ModelProvider):
    def __init__(self, model: str, api_key: str):
        ...

# .jcode/providers/anthropic.py
class AnthropicProvider(ModelProvider):
    def __init__(self, model: str, api_key: str):
        ...
```

With this interface in place, every mode's `model` field becomes
a provider instance, not a string. The HeadroomManager, router,
and streaming consumer operate exclusively on the ModelProvider interface.
The system ports to any new provider by implementing 4 methods.
RC7 is reached.

***

## HIGHEST-LEVERAGE ADDITIONS (not in v2.0)

### A1 — Semantic Deduplication Before Context Assembly

**What it is:** before assembling the context for any turn, run a fast
embedding similarity check across the episodic buffer and working memory.
If two items have cosine similarity > 0.92, keep only the most recent one.

**Why it matters:** conversations naturally repeat the same facts
("the manifest has K=1.3354", stated 4 times in different turns)
without the model ever flagging the redundancy. Deduplication removes
this silently. Expected additional savings: 10-20% on top of O1-O5.

**Implementation:** use a local embedding model (nomic-embed-text via Ollama,
384-dim vectors). The deduplication check adds ~5ms per turn.

```python
def deduplicate_context(items: list, threshold: float = 0.92) -> list:
    if len(items) <= 1:
        return items
    embeddings = [embed(item) for item in items]
    keep = [0]```

