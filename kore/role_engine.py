"""Sprint 5 — Role Engine: Rolleninstanziierung + Alias-Resolution aus YAML.

Liest Routing-Configs (v1 hybrid_local, v2 cloud_first) und resolved
LiteLLM-Aliase basierend auf Complexity, PII und Routing-Modus.
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional

import yaml

from contract_registry import (
    BuildManifest,
    CodeDelta,
    FailureNote,
    InterfaceContract,
    MemorySnapshot,
    TestResult,
)


class RoutingMode(str, Enum):
    HYBRID_LOCAL = "hybrid_local"  # v1: lokal primär, Cloud bei Bedarf
    CLOUD_FIRST = "cloud_first"   # v2: Cloud primär, lokal nur Fallback


@dataclass
class RoleConfig:
    """Konfiguration einer Inner-Circle-Rolle."""
    local: str = "coder"
    cloud: str = ""
    cloud_primary: str = ""
    cloud_secondary: str = ""
    cloud_tertiary: str = ""
    fallback: str = "forge-base"
    fallback_local: str = "forge-base"
    emergency_local: str = "coder"
    max_tokens: int = 4096
    temperature: float = 0.1
    complexity_threshold: float = 0.5
    artefact_out: str = ""
    cloud_never: bool = False
    synergy_gate: str = ""
    joker_trigger: float = 0.20


@dataclass
class RouteConfig:
    """Vollständige Routing-Config."""
    name: str = "kore-inner-circle-v1"
    version: int = 1
    routing_mode: RoutingMode = RoutingMode.HYBRID_LOCAL
    roles: Dict[str, RoleConfig] = field(default_factory=dict)
    memory_local_only: bool = True
    complexity_gate: float = 0.5
    vesica_pair: List[str] = field(default_factory=lambda: ["c", "d"])
    vesica_gap_gate: float = 0.20
    pii_fail_closed: bool = True
    local_only_aliases: List[str] = field(
        default_factory=lambda: ["researcher", "deep"]
    )


# ── Prompt-Templates ────────────────────────────────────────────────────────

PROMPT_TEMPLATES: Dict[str, str] = {
    "architect": (
        "SYSTEM: Du bist der Architect im KORE Inner Circle.\n"
        "Aufgabe: Zerlegung des Projekt-Specs in einen Dependency-Graphen.\n\n"
        "REGELN:\n"
        "- Output ist ausschließlich ein BuildManifest (JSON)\n"
        "- Keine freie Prosa — nur strukturierte Artefakte\n"
        "- Jeder Knoten hat: id, title, depends_on[], risk_score, role\n"
        "- Minimum-Energy-Pfad: höchster Fortschritt bei niedrigstem Risiko\n"
        "- Bei Spec-Ambiguität: UNDECIDABLE-Flag → Human Gate\n\n"
        "INPUT: {spec}\n"
        "OUTPUT: BuildManifest"
    ),
    "builder": (
        "SYSTEM: Du bist der Builder im KORE Inner Circle.\n"
        "Aufgabe: Implementierung exakt des nächsten Knotens auf der Dyson Road.\n\n"
        "REGELN:\n"
        "- Implementiere NUR den zugewiesenen Knoten — kein Scope-Creep\n"
        "- Output ist CodeDelta: files_changed[], diff, test_commands[]\n"
        "- Keine Erklärungen — nur Code + Diff\n"
        "- Bei fehlender Dependency: ToolCallFailure → Constraint-Injection\n\n"
        "INPUT:\n"
        "  node: {node}\n"
        "  contracts: {contracts}\n"
        "  memory_context: {memory_context}\n"
        "OUTPUT: CodeDelta"
    ),
    "critic": (
        "SYSTEM: Du bist der Critic im KORE Inner Circle.\n"
        "Aufgabe: Strukturierte Fehleranalyse — keine freie Debatte.\n\n"
        "REGELN:\n"
        "- Output ist FailureNote (JSON) oder PASS-Signal\n"
        "- Prüfe auf: Spec-Drift, Overengineering, falsche Dependencies\n"
        "- Bei Gegenwind: SPEC_UNCLEAR-Constraint → Architect re-freeze\n\n"
        "INPUT:\n"
        "  code_delta: {code_delta}\n"
        "  original_spec: {spec}\n"
        "  constraint_history: {constraint_history}\n"
        "OUTPUT: FailureNote | PASS"
    ),
    "tester": (
        "SYSTEM: Du bist der Tester im KORE Inner Circle.\n"
        "Aufgabe: Validierung von Build, Tests, Typen und Regression.\n\n"
        "REGELN:\n"
        "1. DETERMINISTISCH ZUERST: pytest + compileall + mypy + bandit\n"
        "2. LLM-ADVISORY: judge — nur wenn deterministisch passed\n"
        "3. SCHEMA: micro-coder — JSON-Output-Validierung\n"
        "4. HarnessScore generieren → done_gate.py übergeben\n\n"
        "INPUT: {code_delta}\n"
        "OUTPUT: TestResult"
    ),
    "memory_keeper": (
        "SYSTEM: Du bist der Memory Keeper im KORE Inner Circle.\n"
        "Aufgabe: Kompression und Persistenz des Session-Zustands.\n\n"
        "REGELN:\n"
        "- NIE Cloud — ausschließlich lokal (Invariante)\n"
        "- Nach jedem Knoten: Pattern in K2 Library\n"
        "- Nach jedem Failure: Anti-Pattern in K3 Guard\n"
        "- Confidence Decay: Relevanz sinkt ohne Bestätigung\n\n"
        "INPUT:\n"
        "  node_result: {node_result}\n"
        "  constraint_history: {constraint_history}\n"
        "  prior_snapshot: {prior_snapshot}\n"
        "OUTPUT: MemorySnapshot"
    ),
}


# ── Role Engine ──────────────────────────────────────────────────────────────

class RoleEngine:
    """Rolleninstanziierung und Alias-Resolution."""

    def __init__(self, route_config: RouteConfig) -> None:
        self.config = route_config

    @classmethod
    def from_yaml(cls, yaml_path: str) -> "RoleEngine":
        """Lädt Konfiguration aus YAML-Datei."""
        with open(yaml_path, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f)

        route_data = data.get("route", data)
        rc = RouteConfig(
            name=route_data.get("name", "kore-inner-circle"),
            version=route_data.get("version", 1),
            routing_mode=RoutingMode(
                route_data.get("routing_mode", "hybrid_local")
            ),
            memory_local_only=route_data.get("memory_local_only", True),
            complexity_gate=route_data.get("second_opinion", {}).get(
                "complexity_gate", 0.5
            ),
            vesica_pair=route_data.get("second_opinion", {}).get(
                "vesica_pair", ["c", "d"]
            ),
            vesica_gap_gate=route_data.get("second_opinion", {}).get(
                "vesica_gap_gate", 0.20
            ),
            pii_fail_closed=route_data.get("privacy_gates", {}).get(
                "pii_fail_closed", True
            ),
            local_only_aliases=route_data.get("privacy_gates", {}).get(
                "local_only_aliases", ["researcher", "deep"]
            ),
        )

        for role_name, role_data in route_data.get("roles", {}).items():
            conf = RoleConfig(
                local=role_data.get("local") or role_data.get("local_only", "coder"),
                cloud=role_data.get("cloud", ""),
                cloud_primary=role_data.get("cloud_primary", ""),
                cloud_secondary=role_data.get("secondary", ""),
                cloud_tertiary=role_data.get("tertiary", ""),
                fallback=role_data.get("fallback_local", "forge-base"),
                fallback_local=role_data.get("fallback_local", "forge-base"),
                emergency_local=role_data.get("emergency_local", "coder"),
                max_tokens=role_data.get("max_tokens", 4096),
                temperature=role_data.get("temperature", 0.1),
                complexity_threshold=role_data.get("complexity_threshold", 0.5),
                artefact_out=role_data.get("artefact_out", ""),
                cloud_never=role_data.get("cloud", "") == "never" or role_data.get("local_only", "") != "",
                synergy_gate=role_data.get("synergy_gate", ""),
                joker_trigger=role_data.get("joker_trigger", 0.20),
            )
            rc.roles[role_name] = conf

        return cls(rc)

    def resolve_alias(
        self,
        role: str,
        complexity: float = 0.5,
        is_pii: bool = False,
    ) -> str:
        """Wählt das optimale Modell-Alias für eine Rolle."""
        if role not in self.config.roles:
            return "coder"  # Fallback

        conf = self.config.roles[role]

        # Memory Keeper = IMMER lokal (Invariante)
        if conf.cloud_never:
            return conf.local

        # PII → fail-closed: nur lokal
        if is_pii and self.config.pii_fail_closed:
            return conf.fallback_local

        routing_mode = self.config.routing_mode

        if routing_mode == RoutingMode.CLOUD_FIRST:
            # Cloud-First-Kette
            if complexity >= 0.7 and conf.cloud_tertiary:
                return conf.cloud_tertiary
            if complexity >= 0.5 and conf.cloud_secondary:
                return conf.cloud_secondary
            if conf.cloud_primary:
                return conf.cloud_primary
            if conf.cloud:
                return conf.cloud
            return conf.fallback_local

        # hybrid_local (v1)
        if complexity >= conf.complexity_threshold:
            return conf.cloud or conf.local
        return conf.local

    def render_prompt(self, role: str, context: Dict[str, Any]) -> str:
        """Füllt Prompt-Template mit Kontext."""
        template = PROMPT_TEMPLATES.get(role, "SYSTEM: Rolle {role}.\nINPUT: {input}")
        return template.format(role=role, **context)

    def list_roles(self) -> List[str]:
        return list(self.config.roles.keys())

    def get_config(self, role: str) -> Optional[RoleConfig]:
        return self.config.roles.get(role)
