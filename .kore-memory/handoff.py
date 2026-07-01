#!/usr/bin/env python3
import io
import sys

# Force UTF-8 encoding for stdout/stderr on Windows (emoji support)
if sys.platform == "win32" and hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")
"""
KORE Handoff Protocol — cross-IDE continuity automation.

Usage:
    python .kore-memory/handoff.py start          # Read current state
    python .kore-memory/handoff.py end            # Write new handoff entry
    python .kore-memory/handoff.py sync           # Sync handoff to KORE memory API
    python .kore-memory/handoff.py status         # Quick status summary

Makefile wrappers:
    make handoff-start
    make handoff-end
    make handoff-sync
"""

import json
import os
import datetime
import subprocess
from pathlib import Path
from typing import Optional

REPO_ROOT = Path(__file__).resolve().parent.parent
MEMORY_DIR = REPO_ROOT / ".kore-memory"
STATE_FILE = REPO_ROOT / "KORE_STATE.md"
CURRENT_WORK = MEMORY_DIR / "current-work.json"
HANDOFFS_LOG = MEMORY_DIR / "handoffs.jsonl"
DECISIONS_LOG = MEMORY_DIR / "decisions.jsonl"
BLOCKERS_LOG = MEMORY_DIR / "blockers.jsonl"

KORE_API_BASE = os.environ.get("KORE_API_BASE", "https://kore-api.up.railway.app")
KORE_API_KEY = os.environ.get("KORE_API_KEY", "")

ANSI = {
    "green": "\033[92m",
    "yellow": "\033[93m",
    "red": "\033[91m",
    "cyan": "\033[96m",
    "bold": "\033[1m",
    "dim": "\033[2m",
    "reset": "\033[0m",
}


def e(msg: str, color: str = "", **kw):
    """Print to stderr with optional color."""
    prefix = ANSI.get(color, "")
    reset = ANSI["reset"] if prefix else ""
    print(f"{prefix}{msg}{reset}", file=sys.stderr, **kw)


def load_json(path: Path) -> dict:
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return {}
    return {}


def save_json(path: Path, data: dict):
    path.write_text(
        json.dumps(data, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def append_jsonl(path: Path, record: dict):
    with open(path, "a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")


def read_tail(path: Path, n: int = 3) -> list[str]:
    """Read last n non-empty lines from a file."""
    if not path.exists():
        return []
    lines = [l.strip() for l in path.read_text(encoding="utf-8").splitlines() if l.strip()]
    return lines[-n:]


def now_iso() -> str:
    return datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")


def handoff_id() -> str:
    ts = datetime.datetime.utcnow().strftime("%Y-%m-%dT%H-%M-%SZ")
    branch = _git_branch()
    return f"handoff_{ts}_{branch}"


def _git_branch() -> str:
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--abbrev-ref", "HEAD"],
            capture_output=True, text=True, cwd=REPO_ROOT, timeout=5,
        )
        return result.stdout.strip() or "unknown"
    except Exception:
        return "unknown"


def _git_log_since(tag: str = "HEAD~5") -> list[str]:
    try:
        result = subprocess.run(
            ["git", "log", "--oneline", tag],
            capture_output=True, text=True, cwd=REPO_ROOT, timeout=5,
        )
        return [l.strip() for l in result.stdout.splitlines() if l.strip()]
    except Exception:
        return []


def _changed_files() -> list[str]:
    try:
        result = subprocess.run(
            ["git", "diff", "--name-only", "HEAD~1..HEAD"],
            capture_output=True, text=True, cwd=REPO_ROOT, timeout=5,
        )
        files = [l.strip() for l in result.stdout.splitlines() if l.strip()]
        return files if files else []
    except Exception:
        return []


# ── Commands ──────────────────────────────────────────────────────────

def cmd_start():
    """Print current state — for session start handoff recovery."""
    e("╔══════════════════════════════════════════════════════════╗", "cyan")
    e("║        KORE Handoff Protocol — Session Start            ║", "cyan")
    e("╚══════════════════════════════════════════════════════════╝", "cyan")
    print()

    # KORE_STATE.md summary
    if STATE_FILE.exists():
        e("── KORE_STATE.md ──", "bold")
        content = STATE_FILE.read_text(encoding="utf-8")
        print(content)

    # current-work.json
    cw = load_json(CURRENT_WORK)
    if cw:
        e("── Current Work (machine) ──", "bold")
        print(f"  Mission:       {cw.get('mission', '?')}")
        print(f"  Focus:         {cw.get('current_focus', '?')}")
        print(f"  Branch:        {cw.get('active_branch', '?')}")
        print(f"  Live URL:      {cw.get('live_url', '?')}")
        print(f"  Revenue:       €{cw.get('revenue_to_date_eur', 0)}")
        print(f"  Services:      {cw.get('live_services', '?')}/13")
        if cw.get("in_progress"):
            print(f"  In Progress:   {', '.join(cw['in_progress'])}")
        if cw.get("blocked"):
            print(f"  {'Blocked:':16s} {', '.join(cw['blocked'])}")
        if cw.get("next_tasks"):
            print(f"  Next:          {', '.join(cw['next_tasks'])}")
        print()

    # Recent handoffs
    recent = read_tail(HANDOFFS_LOG, 3)
    if recent:
        e("── Recent Handoffs (last 3) ──", "bold")
        for line in recent:
            try:
                h = json.loads(line)
                ts = h.get("timestamp", "?")
                done = ", ".join(h.get("completed", [])[:3])
                nxt = ", ".join(h.get("next_steps", [])[:3])
                print(f"  [{ts}]")
                if done:
                    print(f"    Done:  {done}{'...' if len(h.get('completed', [])) > 3 else ''}")
                if nxt:
                    print(f"    Next:  {nxt}{'...' if len(h.get('next_steps', [])) > 3 else ''}")
            except json.JSONDecodeError:
                print(f"  (parse error) {line[:80]}")
        print()

    # Recent commits
    commits = _git_log_since("HEAD~3")
    e("── Recent Commits ──", "bold")
    for c in commits:
        print(f"  {c}")
    print()

    e("── Protocol ──", "bold")
    e("  At end of session, run:  python .kore-memory/handoff.py end")
    e("  Or:                     make handoff-end")
    print()

    return 0


def cmd_end():
    """Write a new handoff entry — for session end."""
    e("╔══════════════════════════════════════════════════════════╗", "cyan")
    e("║         KORE Handoff Protocol — Session End             ║", "cyan")
    e("╚══════════════════════════════════════════════════════════╝", "cyan")
    print()

    cw = load_json(CURRENT_WORK)

    # Gather completed items
    e("What was completed this session? (comma-separated, leave blank if none)", "yellow")
    completed_raw = sys.stdin.readline().strip()
    completed = [c.strip() for c in completed_raw.split(",") if c.strip()]

    # Gather in-progress
    e("What is still in progress? (comma-separated)", "yellow")
    ip_raw = sys.stdin.readline().strip()
    in_progress = [c.strip() for c in ip_raw.split(",") if c.strip()]

    # Gather blockers
    e("Any blockers? (comma-separated, leave blank if none)", "yellow")
    bl_raw = sys.stdin.readline().strip()
    blockers = [c.strip() for c in bl_raw.split(",") if c.strip()]

    # Gather next steps
    e("Next steps? (comma-separated)", "yellow")
    ns_raw = sys.stdin.readline().strip()
    next_steps = [c.strip() for c in ns_raw.split(",") if c.strip()]

    # Gather decisions
    e("Any decisions made? (comma-separated, leave blank if none)", "yellow")
    dec_raw = sys.stdin.readline().strip()
    decisions = [c.strip() for c in dec_raw.split(",") if c.strip()]

    # Detect changed files from git
    changed = _changed_files()
    if changed:
        e(f"Detected {len(changed)} changed files from git diff.", "dim")

    # Build handoff record
    branch = _git_branch()
    now = now_iso()
    hid = handoff_id()

    handoff = {
        "handoff_id": hid,
        "repo": "kore-api",
        "agent_tool": "KORE",
        "branch": branch,
        "timestamp": now,
        "completed": completed,
        "in_progress": in_progress,
        "blocked": blockers,
        "next_steps": next_steps,
        "decisions": decisions,
        "files_touched": changed,
    }

    # Append to handoffs.jsonl
    append_jsonl(HANDOFFS_LOG, handoff)
    e(f"✓ Appended handoff to {HANDOFFS_LOG}", "green")

    # Update current-work.json
    if completed:
        existing_done = cw.get("done", [])
        for item in completed:
            if item not in existing_done:
                existing_done.append(item)
        cw["done"] = existing_done

    if in_progress:
        cw["in_progress"] = in_progress

    if blockers:
        cw["blocked"] = blockers

    if next_steps:
        cw["next_tasks"] = next_steps

    cw["active_branch"] = branch
    cw["last_handoff"] = now
    save_json(CURRENT_WORK, cw)
    e(f"✓ Updated {CURRENT_WORK}", "green")

    # Append decisions to decisions.jsonl
    for dec in decisions:
        decision_record = {
            "decision_id": f"dec_{now}_{hash(dec) % 10000:04d}",
            "timestamp": now,
            "decision": dec,
            "handoff_id": hid,
            "status": "active",
        }
        append_jsonl(DECISIONS_LOG, decision_record)

    if decisions:
        e(f"✓ Appended {len(decisions)} decisions to {DECISIONS_LOG}", "green")

    # Append blockers to blockers.jsonl
    for blk in blockers:
        blocker_record = {
            "blocker_id": f"blk_{now}_{hash(blk) % 10000:04d}",
            "timestamp": now,
            "blocker": blk,
            "handoff_id": hid,
            "status": "open",
        }
        append_jsonl(BLOCKERS_LOG, blocker_record)

    if blockers:
        e(f"✓ Appended {len(blockers)} blockers to {BLOCKERS_LOG}", "green")

    print()
    e("── Handoff Summary ──", "bold")
    e(f"  ID:       {hid}", "dim")
    e(f"  Time:     {now}", "dim")
    e(f"  Branch:   {branch}", "dim")
    if completed:
        e(f"  Done:     {', '.join(completed)}", "green")
    if in_progress:
        e(f"  Active:   {', '.join(in_progress)}", "yellow")
    if blockers:
        e(f"  Blocked:  {', '.join(blockers)}", "red")
    if next_steps:
        e(f"  Next:     {', '.join(next_steps)}", "cyan")
    print()

    e("── Auto-prompt for next agent ──", "bold")
    prompt = _build_continuation_prompt(completed, in_progress, blockers, next_steps)
    print(prompt)
    print()

    return 0


def cmd_status():
    """Quick status summary."""
    cw = load_json(CURRENT_WORK)
    if not cw:
        e("No current-work.json found.", "red")
        return 1

    e("── KORE Status ──", "bold")
    print(f"  Focus:     {cw.get('current_focus', '?')}")
    print(f"  Branch:    {cw.get('active_branch', '?')}")
    print(f"  Revenue:   €{cw.get('revenue_to_date_eur', 0)}")
    print(f"  Services:  {cw.get('live_services', '?')}/13")
    print(f"  Live URL:  {cw.get('live_url', '?')}")

    handoff_count = 0
    if HANDOFFS_LOG.exists():
        handoff_count = len([l for l in HANDOFFS_LOG.read_text().splitlines() if l.strip()])
    print(f"  Handoffs:  {handoff_count}")
    print(f"  Next:      {', '.join(cw.get('next_tasks', ['?']))}")
    return 0


def cmd_sync():
    """Sync handoff state to KORE memory API."""
    if not KORE_API_KEY:
        e("KORE_API_KEY not set. Set env var or use `make handoff-sync KORE_API_KEY=...`", "red")
        return 1

    import urllib.request
    import urllib.error

    cw = load_json(CURRENT_WORK)
    if not cw:
        e("No current-work.json to sync.", "red")
        return 1

    # Read last handoff
    recent = read_tail(HANDOFFS_LOG, 1)
    if not recent:
        e("No handoffs to sync.", "yellow")
        return 1

    try:
        last_handoff = json.loads(recent[-1])
    except json.JSONDecodeError:
        e("Last handoff is corrupted.", "red")
        return 1

    # Build context entry for memory API
    payload = json.dumps({
        "type": "context",
        "scope": "project",
        "content": {
            "mission": cw.get("mission", ""),
            "current_focus": cw.get("current_focus", ""),
            "completed": last_handoff.get("completed", []),
            "in_progress": last_handoff.get("in_progress", []),
            "next_steps": last_handoff.get("next_steps", []),
            "decisions": last_handoff.get("decisions", []),
        },
        "trace_id": last_handoff.get("handoff_id", ""),
        "timestamp": now_iso(),
    }).encode("utf-8")

    url = f"{KORE_API_BASE}/v1/memory/remember"
    req = urllib.request.Request(
        url,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "x-api-key": KORE_API_KEY,
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            body = resp.read().decode("utf-8")
            e(f"✓ Synced to KORE memory API: {resp.status}", "green")
            print(body[:500])
    except urllib.error.HTTPError as ex:
        e(f"✗ API error {ex.code}: {ex.read().decode()[:200]}", "red")
        return 1
    except urllib.error.URLError as ex:
        e(f"✗ Connection error: {ex.reason}", "red")
        return 1

    return 0


def _build_continuation_prompt(
    completed: list[str],
    in_progress: list[str],
    blockers: list[str],
    next_steps: list[str],
) -> str:
    lines = [
        "## Continuation Prompt for Next Agent",
        "",
        "### Context",
        "This handoff was written at the end of a session. Read the full handoff.",
    ]

    if in_progress:
        lines.append("")
        lines.append("### Active Work")
        for item in in_progress:
            lines.append(f"- {item}")

    if blockers:
        lines.append("")
        lines.append("### Blockers")
        for item in blockers:
            lines.append(f"- {item}")

    if next_steps:
        lines.append("")
        lines.append("### Next Steps")
        for i, item in enumerate(next_steps, 1):
            lines.append(f"{i}. {item}")

    lines.append("")
    lines.append("### Protocol")
    lines.append("1. Read KORE_STATE.md, .kore-memory/current-work.json, last 3 lines of handoffs.jsonl")
    lines.append("2. Pick up from the next steps above")
    lines.append("3. At session end, run: `make handoff-end`")

    return "\n".join(lines)


# ── CLI ──────────────────────────────────────────────────────────────

def main():
    if len(sys.argv) < 2:
        e("Usage:", "bold")
        e("  python .kore-memory/handoff.py start    # Read current state")
        e("  python .kore-memory/handoff.py end      # Write new handoff entry")
        e("  python .kore-memory/handoff.py status   # Quick status summary")
        e("  python .kore-memory/handoff.py sync     # Sync to KORE memory API")
        return 1

    cmd = sys.argv[1]

    # Ensure .kore-memory dir exists
    MEMORY_DIR.mkdir(parents=True, exist_ok=True)

    commands = {
        "start": cmd_start,
        "end": cmd_end,
        "status": cmd_status,
        "sync": cmd_sync,
    }

    handler = commands.get(cmd)
    if not handler:
        e(f"Unknown command: {cmd}", "red")
        return 1

    try:
        return handler()
    except KeyboardInterrupt:
        e("\nAborted.", "yellow")
        return 1
    except Exception as ex:
        e(f"Error: {ex}", "red")
        return 1


if __name__ == "__main__":
    sys.exit(main())
