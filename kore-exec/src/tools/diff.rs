use similar::{ChangeTag, TextDiff};

use crate::error::{KoreError, KoreResult};

pub fn diff(a: &str, b: &str) -> KoreResult<String> {
    let diff = TextDiff::from_lines(a, b);
    let mut out = String::new();
    for change in diff.iter_all_changes() {
        let sign = match change.tag() {
            ChangeTag::Delete => "-",
            ChangeTag::Insert => "+",
            ChangeTag::Equal => " ",
        };
        out.push_str(sign);
        out.push_str(change.value());
        if !change.value().ends_with('\n') {
            out.push('\n');
        }
    }
    if out.is_empty() && a == b {
        return Ok(String::new());
    }
    Ok(out)
}

pub fn diff_from_args(args: &serde_json::Value) -> KoreResult<String> {
    let a = args
        .get("a")
        .and_then(|v| v.as_str())
        .ok_or_else(|| KoreError::MissingArg("a".to_string()))?;
    let b = args
        .get("b")
        .and_then(|v| v.as_str())
        .ok_or_else(|| KoreError::MissingArg("b".to_string()))?;
    diff(a, b)
}
