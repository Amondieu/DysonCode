/// jcode Pre-Check Gate — Rust fast-path for all 8 compile-time invariant laws.
///
/// Evaluates each law in parallel (via rayon) and returns a JSON array of
/// InvariantResult objects matching the Python `jcode_models.InvariantResult`.
///
/// Performance target: < 500µs for all 8 laws on typical input (vs ~48ms Python fallback).

use serde::Serialize;
use std::collections::HashSet;
use std::time::Instant;

// ── Output types (must match Python jcode_models.InvariantResult) ───────────

#[derive(Debug, Serialize)]
struct InvariantResult {
    law_id: String,
    name: String,
    passed: bool,
    phase: String,
    reason: String,
    #[serde(skip_serializing_if = "serde_json::Value::is_null")]
    evidence: serde_json::Value,
    latency_us: f64,
}

#[derive(Debug, Serialize)]
struct PreCheckBatch {
    passed: bool,
    skip_per_stage: bool,
    latency_ms: f64,
    invariants: Vec<InvariantResult>,
    errors: Vec<String>,
    metadata: serde_json::Value,
}

// ── Entrypoint ──────────────────────────────────────────────────────────────

pub fn jcode_precheck(input: &serde_json::Value) -> Result<String, crate::error::KoreError> {
    let started = Instant::now();
    let jcode_input = input
        .get("input")
        .unwrap_or(input);

    // Evaluate all 8 laws sequentially (Rust is fast enough that sequential
    // beats Python's thread-pool overhead; rayon would add ~200µs spawn cost)
    let laws: [(&str, &str, LawEval); 8] = [
        ("law_1_compressibility",        "LAW_1_COMPRESSIBILITY",        eval_law_1),
        ("law_2_self_application",       "LAW_2_SELF_APPLICATION",       eval_law_2),
        ("law_4_constraint_precision",   "LAW_4_CONSTRAINT_PRECISION",   eval_law_4),
        ("law_5_shadow_signature",       "LAW_5_SHADOW_SIGNATURE",       eval_law_5),
        ("law_7_category_expansion",     "LAW_7_CATEGORY_EXPANSION",     eval_law_7),
        ("law_8_min_energy_path",        "LAW_8_MIN_ENERGY_PATH",        eval_law_8),
        ("law_10_harvest_before_build",  "LAW_10_HARVEST_BEFORE_BUILD",  eval_law_10),
        ("law_11_zero_wasted_surface",   "LAW_11_ZERO_WASTED_SURFACE",   eval_law_11),
    ];

    let mut invariants = Vec::with_capacity(8);
    let mut errors: Vec<String> = Vec::new();

    for (law_id, name, eval_fn) in laws {
        let law_start = Instant::now();
        match eval_fn(jcode_input) {
            Ok((passed, reason, evidence)) => {
                let latency_us = law_start.elapsed().as_secs_f64() * 1_000_000.0;
                invariants.push(InvariantResult {
                    law_id: law_id.to_string(),
                    name: name.to_string(),
                    passed,
                    phase: "compile".to_string(),
                    reason,
                    evidence,
                    latency_us: (latency_us * 100.0).round() / 100.0,
                });
            }
            Err(e) => {
                errors.push(format!("{law_id} crashed: {e}"));
                invariants.push(InvariantResult {
                    law_id: law_id.to_string(),
                    name: name.to_string(),
                    passed: false,
                    phase: "compile".to_string(),
                    reason: format!("Evaluator crashed: {e}"),
                    evidence: serde_json::Value::Null,
                    latency_us: 0.0,
                });
            }
        }
    }

    let all_passed = invariants.iter().all(|r| r.passed) && errors.is_empty();
    let latency_ms = started.elapsed().as_secs_f64() * 1000.0;

    let batch = PreCheckBatch {
        passed: all_passed,
        skip_per_stage: all_passed,
        latency_ms: (latency_ms * 1000.0).round() / 1000.0,
        invariants,
        errors,
        metadata: serde_json::json!({
            "mode": "rust_fastpath",
            "laws_evaluated": 8,
            "engine": "kore-exec v0.1",
        }),
    };

    serde_json::to_string(&batch).map_err(|e| crate::error::KoreError::UnknownTool(format!("jcode_precheck serialization: {e}")))
}

// ── Law Evaluators ──────────────────────────────────────────────────────────

type LawEval = for<'a> fn(&'a serde_json::Value) -> Result<(bool, String, serde_json::Value), String>;

/// Law 1: Compressibility — output must be compressible without information loss.
fn eval_law_1(input: &serde_json::Value) -> Result<(bool, String, serde_json::Value), String> {
    let raw = input.to_string();
    let raw_bytes = raw.len();

    if raw_bytes < 8 {
        return Ok((true, "Input too small for compression assessment".into(), serde_json::json!({
            "raw_bytes": raw_bytes, "bound_type": "vacuous"
        })));
    }

    // Token uniqueness as compression proxy
    let tokens: Vec<&str> = raw.split_whitespace().collect();
    let total = tokens.len().max(1);
    let unique: HashSet<&&str> = tokens.iter().collect();
    let ratio = unique.len() as f64 / total as f64;

    let evidence = serde_json::json!({
        "raw_bytes": raw_bytes,
        "total_tokens": total,
        "unique_tokens": unique.len(),
        "ratio": (ratio * 10000.0).round() / 10000.0,
        "bound_type": "heuristic_token_uniqueness",
    });

    if ratio > 0.95 && raw_bytes > 1000 {
        Ok((false, format!("Low compressibility: {:.2}% unique tokens", ratio * 100.0), evidence))
    } else {
        Ok((true, format!("Compressibility acceptable: {:.2}% unique", ratio * 100.0), evidence))
    }
}

/// Law 2: Self-application — spec should tend toward self-reference.
fn eval_law_2(input: &serde_json::Value) -> Result<(bool, String, serde_json::Value), String> {
    let spec = input.get("spec")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let spec_lower = spec.to_lowercase();

    let markers = ["self", "jcode", "dyson", "invariant", "fixpoint", "ratchet"];
    let found: Vec<&str> = markers.iter().filter(|m| spec_lower.contains(*m)).copied().collect();

    Ok((true, format!("Self-referential check: {} markers found", found.len()), serde_json::json!({
        "markers_found": !found.is_empty(),
        "markers": found,
    })))
}

/// Law 4: Constraint precision — constraints must be specific, not vague.
fn eval_law_4(input: &serde_json::Value) -> Result<(bool, String, serde_json::Value), String> {
    let spec = input.get("spec")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let spec_lower = spec.to_lowercase();

    let vague_terms = ["maybe", "probably", "perhaps", "should", "could", "might", "sort of"];
    let found: Vec<&str> = vague_terms.iter().filter(|t| spec_lower.contains(*t)).copied().collect();

    if !found.is_empty() {
        Ok((false, format!("Vague constraint terms: {:?}", found), serde_json::json!({
            "vague_terms": found,
        })))
    } else {
        Ok((true, "Constraint language is precise".into(), serde_json::json!({
            "vague_terms": [],
        })))
    }
}

/// Law 5: Shadow/effect signature — detectable cause-effect structure.
fn eval_law_5(input: &serde_json::Value) -> Result<(bool, String, serde_json::Value), String> {
    let nodes = input.get("nodes").and_then(|v| v.as_array());
    let edges = input.get("edges").and_then(|v| v.as_array());

    let (nodes, edges) = match (nodes, edges) {
        (Some(n), Some(e)) => (n, e),
        _ => return Ok((true, "No graph structure to validate (vacuous pass)".into(), serde_json::Value::Null)),
    };

    let node_ids: HashSet<&str> = nodes.iter()
        .filter_map(|n| n.get("id").and_then(|v| v.as_str()))
        .collect();

    let mut orphan_sources = 0usize;
    let mut orphan_targets = 0usize;

    for edge in edges {
        if let (Some(src), Some(tgt)) = (edge.get("source").and_then(|v| v.as_str()), edge.get("target").and_then(|v| v.as_str())) {
            if !node_ids.contains(src) { orphan_sources += 1; }
            if !node_ids.contains(tgt) { orphan_targets += 1; }
        }
    }

    if orphan_sources > 0 || orphan_targets > 0 {
        Ok((false, format!("Shadow edges: {orphan_sources} orphan sources, {orphan_targets} orphan targets"), serde_json::json!({
            "orphan_sources": orphan_sources,
            "orphan_targets": orphan_targets,
        })))
    } else {
        Ok((true, "Graph has clean cause-effect structure".into(), serde_json::json!({
            "orphan_sources": 0, "orphan_targets": 0,
        })))
    }
}

/// Law 7: Category expansion — node count enables expansion.
fn eval_law_7(input: &serde_json::Value) -> Result<(bool, String, serde_json::Value), String> {
    let node_count = input.get("nodes")
        .and_then(|v| v.as_array())
        .map(|a| a.len())
        .unwrap_or(0);

    Ok((true, format!("Graph has {node_count} nodes — category expansion possible"), serde_json::json!({
        "node_count": node_count,
    })))
}

/// Law 8: Minimum-energy path — sparse graph detection.
fn eval_law_8(input: &serde_json::Value) -> Result<(bool, String, serde_json::Value), String> {
    let nodes = input.get("nodes").and_then(|v| v.as_array());
    let edges = input.get("edges").and_then(|v| v.as_array());

    let (nodes, edges) = match (nodes, edges) {
        (Some(n), Some(e)) => (n, e),
        _ => return Ok((true, "No nodes to compute path (vacuous pass)".into(), serde_json::Value::Null)),
    };

    let n = nodes.len();
    let e = edges.len();

    if n > 2 && e < n / 2 {
        Ok((false, format!("Sparse graph: {e} edges for {n} nodes (min {} expected)", n / 2), serde_json::json!({
            "edges": e, "nodes": n,
        })))
    } else {
        Ok((true, "Minimum-energy path computable".into(), serde_json::json!({
            "edges": e, "nodes": n,
        })))
    }
}

/// Law 10: Harvest before build — audit existing capacity before creating new.
fn eval_law_10(input: &serde_json::Value) -> Result<(bool, String, serde_json::Value), String> {
    let spec = input.get("spec")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let spec_lower = spec.to_lowercase();

    let build_kw = ["create", "build", "write", "generate", "implement", "add"];
    let harvest_kw = ["audit", "check", "review", "harvest", "inspect", "observe"];

    let build_count = build_kw.iter().filter(|k| spec_lower.contains(*k)).count();
    let harvest_count = harvest_kw.iter().filter(|k| spec_lower.contains(*k)).count();

    let evidence = serde_json::json!({
        "build_keywords": build_count,
        "harvest_keywords": harvest_count,
    });

    if build_count > 0 && harvest_count == 0 {
        Ok((false, format!("Build keywords ({build_count}) without harvest keywords"), evidence))
    } else {
        Ok((true, format!("Harvest-before-build ratio: {harvest_count}/{build_count}"), evidence))
    }
}

/// Law 11: Zero wasted surface — every dimension must be captured or explicit.
fn eval_law_11(input: &serde_json::Value) -> Result<(bool, String, serde_json::Value), String> {
    let obj = match input.as_object() {
        Some(o) => o,
        None => return Ok((true, "Non-object input (vacuous pass)".into(), serde_json::Value::Null)),
    };

    let total = obj.len();
    let empty_keys: Vec<&str> = obj.iter()
        .filter(|(_, v)| v.is_null() || v.as_str() == Some("") || v.as_array().map(|a| a.is_empty()).unwrap_or(false))
        .map(|(k, _)| k.as_str())
        .collect();

    let empty_count = empty_keys.len();
    if empty_count > total / 2 && total > 0 {
        Ok((false, format!("High ratio of empty fields: {empty_count}/{total}"), serde_json::json!({
            "empty_keys": empty_keys, "total_keys": total,
        })))
    } else {
        Ok((true, format!("Surface utilization: {}/{total}", total - empty_count), serde_json::json!({
            "empty_keys": empty_keys, "total_keys": total,
        })))
    }
}
