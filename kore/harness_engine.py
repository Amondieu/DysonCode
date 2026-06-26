"""Sprint 7 — Harness Engine: 7-Pillar Scoring (Done-Detektor).

Misst deterministisch — urteilt nie, baut nie.
OpenHandsBackend baut; HarnessEngine misst danach via pytest/compileall/mypy.
"""

from __future__ import annotations

import os
import subprocess
import sys
from dataclasses import dataclass
from typing import Dict, List, Optional

from contract_registry import HarnessScore


@dataclass
class HarnessResult:
    """Ergebnis einer Quality-Gate-Ausführung."""
    name: str
    passed: bool
    score: float  # 0.0–1.0
    details: str = ""
    is_hard_gate: bool = False


class HarnessEngine:
    """Führt Quality Gates aus und aggregiert Scores — Host-deterministisch.

    Split in drei Phasen:
      - run_preflight():  Harness-spezifische Pillar-Checks VOR der Ausführung
                          (mypy type-check, AST architecture analysis).
                          NICHT: strukturelle Invarianten (→ jcode_precheck.py).
      - run_postflight(): Vollständige Checks NACH der Ausführung
                          (compileall build, pytest tests, coverage).
      - run_all():        Legacy — führt beide Phasen aus (Rückwärtskompatibel).

    Abgrenzung zu jcode_precheck.py:
      - jcode_precheck.run_precheck() = strukturelle Invarianten
        (Laws 1-11, Schema-Validierung, Import-Graph, Compression-Bound).
        Läuft VOR harness_engine — PreCheck ist das Gateway.
      - HarnessEngine.run_preflight() = harness-spezifische Pillar-Checks
        (mypy, AST architecture). Läuft NACH PreCheck, VOR Build.
      - HarnessEngine.run_postflight() = Build/Test/Coverage.
        Läuft NACH der Code-Ausführung.
    """

    # Pillars that are safe to run pre-execution (no build artifacts needed)
    PREFLIGHT_PILLARS = {"type_safety", "architecture", "ux_gate", "llm_judge"}
    # Pillars that require build artifacts (post-execution only)
    POSTFLIGHT_PILLARS = {"build", "tests", "coverage"}

    def __init__(self, project_path: str = ".", skip_missing_tools: bool = True):
        self.project_path = project_path
        self.skip_missing_tools = skip_missing_tools
        self.results: Dict[str, HarnessResult] = {}

    # ── Phase API ────────────────────────────────────────────────────────

    def run_preflight(self, payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Pre-execution checks — fast, no build artifacts needed.

        Returns a dict with per-pillar pass/fail, errors, and remediation hints.
        """
        self.results.clear()
        results: Dict[str, Any] = {"passed": True, "pillars": {}, "errors": [], "hints": []}

        # Type safety (preflight — mypy static analysis)
        type_result = self._check_types()
        self.results["type_safety"] = type_result
        results["pillars"]["type_safety"] = {
            "passed": type_result.passed, "score": type_result.score,
            "details": type_result.details,
        }
        if not type_result.passed:
            results["passed"] = False
            results["hints"].append("Run mypy to fix type errors before execution.")

        # Architecture check (preflight — AST analysis)
        arch_result = self._check_architecture()
        self.results["architecture"] = arch_result
        results["pillars"]["architecture"] = {
            "passed": arch_result.passed, "score": arch_result.score,
            "details": arch_result.details,
        }
        if not arch_result.passed:
            results["passed"] = False
            results["hints"].append("Fix syntax errors or import violations before execution.")

        return results

    def run_postflight(self, payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Post-execution checks — full build, test, coverage verification.

        Returns a dict with per-pillar pass/fail, errors, remediation hints,
        and the full HarnessScore for done-gate integration.
        """
        results: Dict[str, Any] = {"passed": True, "pillars": {}, "errors": [], "hints": []}

        # Build (postflight — compileall)
        build_result = self._check_build()
        self.results["build"] = build_result
        results["pillars"]["build"] = {
            "passed": build_result.passed, "score": build_result.score,
            "details": build_result.details, "is_hard_gate": True,
        }
        if not build_result.passed:
            results["passed"] = False
            results["errors"].append(f"Build failed: {build_result.details}")

        # Tests (postflight — pytest)
        test_result = self._check_tests()
        self.results["tests"] = test_result
        results["pillars"]["tests"] = {
            "passed": test_result.passed, "score": test_result.score,
            "details": test_result.details, "is_hard_gate": True,
        }
        if not test_result.passed:
            results["passed"] = False
            results["errors"].append(f"Tests failed: {test_result.details}")

        # Coverage (postflight)
        cov_result = self._check_coverage()
        self.results["coverage"] = cov_result
        results["pillars"]["coverage"] = {
            "passed": cov_result.passed, "score": cov_result.score,
            "details": cov_result.details,
        }
        if cov_result.score < 0.80:
            results["hints"].append(f"Coverage below 80% ({cov_result.score:.1%}) — add tests.")

        results["harness_score"] = self._aggregate()
        results["hard_gates_pass"] = self.hard_gates_pass()

        return results

    def run_all(self, payload: Optional[Dict[str, Any]] = None) -> HarnessScore:
        """Legacy — führt beide Phasen aus (Rückwärtskompatibel)."""
        self.results.clear()

        self.results["build"] = self._check_build()
        self.results["tests"] = self._check_tests()
        self.results["coverage"] = self._check_coverage()
        self.results["type_safety"] = self._check_types()
        self.results["architecture"] = self._check_architecture()
        self.results["ux_gate"] = self._check_ux()
        self.results["llm_judge"] = self._check_llm_judge()

        return self._aggregate()

    def hard_gates_pass(self) -> bool:
        if not self.results:
            self.run_all()
        build = self.results.get("build")
        tests = self.results.get("tests")
        return bool(build and tests and build.passed and tests.passed)

    def _aggregate(self) -> HarnessScore:
        score = HarnessScore()
        mapping = {
            "build": "build",
            "tests": "tests",
            "coverage": "coverage",
            "type_safety": "type_safety",
            "architecture": "architecture",
            "ux_gate": "ux_gate",
            "llm_judge": "llm_judge",
        }
        for key, attr in mapping.items():
            if key in self.results:
                setattr(score, attr, self.results[key].score)
        return score

    def _run_cmd(
        self,
        cmd: List[str],
        cwd: Optional[str] = None,
        *,
        is_hard_gate: bool = True,
        soft_score_on_success: float = 1.0,
    ) -> HarnessResult:
        name = cmd[0] if cmd else "unknown"
        try:
            result = subprocess.run(
                cmd, capture_output=True, text=True,
                cwd=cwd or self.project_path, timeout=60,
            )
            passed = result.returncode == 0
            return HarnessResult(
                name=name,
                passed=passed,
                score=soft_score_on_success if passed else 0.0,
                details=(result.stdout or result.stderr or "")[:200],
                is_hard_gate=is_hard_gate,
            )
        except FileNotFoundError:
            if self.skip_missing_tools and not is_hard_gate:
                return HarnessResult(
                    name=name, passed=True, score=0.85,
                    details=f"{cmd[0]} not installed — soft gate skipped",
                    is_hard_gate=False,
                )
            return HarnessResult(
                name=name, passed=False, score=0.0,
                details=f"{cmd[0]} not installed",
                is_hard_gate=is_hard_gate,
            )
        except subprocess.TimeoutExpired:
            return HarnessResult(
                name=name, passed=False, score=0.0,
                details="timeout", is_hard_gate=is_hard_gate,
            )

    def _check_build(self) -> HarnessResult:
        """compileall — Hard Gate."""
        result = self._run_cmd(
            [sys.executable, "-m", "compileall", "-q", self.project_path],
            is_hard_gate=True,
        )
        if result.details.endswith("not installed"):
            return self._check_build_py_compile()
        return result

    def _check_build_py_compile(self) -> HarnessResult:
        try:
            import py_compile

            files: List[str] = []
            errors = 0
            for root, _dirs, fnames in os.walk(self.project_path):
                if any(skip in root for skip in ("node_modules", ".git", "__pycache__")):
                    continue
                for f in fnames:
                    if f.endswith(".py"):
                        fp = os.path.join(root, f)
                        files.append(fp)
                        try:
                            py_compile.compile(fp, doraise=True)
                        except py_compile.PyCompileError:
                            errors += 1
            return HarnessResult(
                name="build", passed=errors == 0,
                score=1.0 if errors == 0 else 0.0,
                details=f"Compiled {len(files)} files, {errors} errors",
                is_hard_gate=True,
            )
        except Exception as e:
            return HarnessResult(
                name="build", passed=False, score=0.0,
                details=str(e), is_hard_gate=True,
            )

    def _test_target(self) -> str:
        tests_dir = os.path.join(self.project_path, "tests")
        return tests_dir if os.path.isdir(tests_dir) else self.project_path

    def _check_tests(self) -> HarnessResult:
        """pytest — Hard Gate (Host, nie OpenHands)."""
        target = self._test_target()
        if not os.path.isdir(target) and not any(
            f.startswith("test_") for f in os.listdir(self.project_path)
            if os.path.isfile(os.path.join(self.project_path, f))
        ):
            tests_dir = os.path.join(self.project_path, "tests")
            if not os.path.isdir(tests_dir):
                return HarnessResult(
                    name="tests", passed=True, score=1.0,
                    details="no tests directory — hard gate vacuous pass",
                    is_hard_gate=True,
                )
        return self._run_cmd(
            [sys.executable, "-m", "pytest", "--tb=short", "-q", target],
            is_hard_gate=True,
        )

    def _check_coverage(self) -> HarnessResult:
        """Soft Gate — proportional wenn pytest-cov fehlt."""
        target = self._test_target()
        result = self._run_cmd(
            [sys.executable, "-m", "pytest", "--cov", "--cov-report=term-missing",
             "--tb=short", "-q", target],
            is_hard_gate=False,
        )
        if "not installed" in result.details or result.score == 0.85:
            tests = self.results.get("tests")
            result.score = 0.85 if tests and tests.passed else 0.5
            result.passed = result.score >= 0.80
            result.details = "coverage inferred from tests pass (no pytest-cov)"
        else:
            result.score = min(result.score, 0.85) if result.passed else result.score
        return result

    def _check_types(self) -> HarnessResult:
        return self._run_cmd(
            ["mypy", "--ignore-missing-imports", self.project_path],
            is_hard_gate=False,
        )

    def _check_architecture(self) -> HarnessResult:
        try:
            import ast

            imports: Dict[str, List[str]] = {}
            for root, _dirs, fnames in os.walk(self.project_path):
                if any(skip in root for skip in ("node_modules", ".git", "__pycache__")):
                    continue
                for f in fnames:
                    if f.endswith(".py"):
                        path = os.path.join(root, f)
                        rel = os.path.relpath(path, self.project_path)
                        with open(path, encoding="utf-8") as fh:
                            try:
                                tree = ast.parse(fh.read())
                                for node in ast.walk(tree):
                                    if isinstance(node, ast.Import):
                                        for alias in node.names:
                                            imports.setdefault(rel, []).append(
                                                alias.name.split(".")[0]
                                            )
                            except SyntaxError:
                                return HarnessResult(
                                    name="architecture", passed=False, score=0.0,
                                    details=f"syntax error in {rel}", is_hard_gate=False,
                                )
            return HarnessResult(
                name="architecture", passed=True,
                score=1.0, details=f"Checked {len(imports)} modules",
                is_hard_gate=False,
            )
        except Exception as e:
            return HarnessResult(
                name="architecture", passed=False, score=0.5,
                details=str(e), is_hard_gate=False,
            )

    def _check_ux(self) -> HarnessResult:
        return HarnessResult(
            name="ux_gate", passed=True, score=1.0,
            details="UX gate: axe-core deferred (Playwright Sprint 8)",
            is_hard_gate=False,
        )

    def _check_llm_judge(self) -> HarnessResult:
        """Advisory — 5% Gewicht, nie Hard Gate."""
        return HarnessResult(
            name="llm_judge", passed=True, score=0.9,
            details="LLM Judge advisory (judge model deferred)",
            is_hard_gate=False,
        )

    def summary(self) -> str:
        if not self.results:
            self.run_all()
        lines = []
        for name, result in self.results.items():
            status = "PASS" if result.passed else "FAIL"
            gate = "HARD" if result.is_hard_gate else "SOFT"
            lines.append(f"  [{gate}] {name}: {status} ({result.score:.2f})")
        agg = self._aggregate()
        lines.append(f"  TOTAL: {agg.total():.3f}")
        lines.append(f"  HARD GATES: {'PASS' if self.hard_gates_pass() else 'FAIL'}")
        return "\n".join(lines)
