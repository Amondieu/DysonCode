"""Patch swarm.py: add resolve_kore_alias function after resolve_llm_alias."""
import sys

SWARM_PATH = r"C:\Users\Shadow\ShadowDrive\0.1.Ai\Grey-OS\agents\swarm.py"

with open(SWARM_PATH, 'r') as f:
    content = f.read()

INSERT_MARKER = "def _llm_auto(local_alias: str, prompt: str, *, stage: str = \"\") -> ChatOpenAI:\n"
INSERT_BEFORE = "    \"\"\"Cloud-aware LLM client with local fallback on resolution or invoke errors."

NEW_FUNC = '''def resolve_kore_alias(role: str, complexity: float = 0.5, is_pii: bool = False) -> str:
    """KORE cloud-first alias resolution (v2). Memory Keeper = immer lokal."""
    if role in MEMORY_KEEPER_ROLES:
        return "fast-draft"
    if role not in KORE_CLOUD_FIRST_ALIASES:
        return "coder"
    chain = KORE_CLOUD_FIRST_ALIASES[role]
    routing_mode = os.environ.get("GREYOS_KORE_ROUTING_MODE", "hybrid_local")
    if routing_mode != "cloud_first":
        # hybrid_local: lokales Modell wenn Cloud deaktiviert
        if not _cloud_burst_enabled() or is_pii:
            # waehle letzten lokalen Alias in der Kette
            for alias in reversed(chain):
                if alias not in CLOUD_BURST_ALIASES:
                    return alias
        return chain[0] if chain else "coder"
    # cloud_first: durchlaufe Kette, fallback auf letzten lokalen
    for alias in chain:
        if is_pii and alias not in CLOUD_BURST_ALIASES:
            return alias  # PII -> nur lokale Aliase
        if alias in CLOUD_BURST_ALIASES or alias in ("deep", "forge-base", "micro-coder", "fast-draft"):
            return alias
    return chain[-1] if chain else "coder"


'''

if INSERT_MARKER not in content:
    print("ERROR: insert marker not found!")
    sys.exit(1)

content = content.replace(INSERT_MARKER, NEW_FUNC + INSERT_MARKER)

with open(SWARM_PATH, 'w') as f:
    f.write(content)

print("Added resolve_kore_alias successfully")
