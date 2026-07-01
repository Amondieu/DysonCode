.PHONY: handoff-start handoff-end handoff-status handoff-sync

# ── KORE Handoff Protocol ──────────────────────────────────────────
# Start a session: read current state, handoffs, and recent commits
handoff-start:
	python .kore-memory/handoff.py start

# End a session: write handoff entry, update state, append decisions/blockers
handoff-end:
	python .kore-memory/handoff.py end

# Quick status summary
handoff-status:
	python .kore-memory/handoff.py status

# Sync handoff state to KORE memory API
# Usage: make handoff-sync KORE_API_KEY=<your-key>
handoff-sync:
	python .kore-memory/handoff.py sync

# ── Development Convenience ────────────────────────────────────────
handoff-help:
	@echo "KORE Handoff Protocol Commands:"
	@echo "  make handoff-start    — Read current state + recent handoffs"
	@echo "  make handoff-end      — Write new handoff + update state files"
	@echo "  make handoff-status   — Quick status summary"
	@echo "  make handoff-sync     — Sync handoff to KORE memory API"
	@echo ""
	@echo "Protocol:"
	@echo "  Every agent must read handoff state before coding."
	@echo "  Every agent must write handoff state after coding."
