use regex::Regex;
use walkdir::WalkDir;

use crate::error::{KoreError, KoreResult};
use crate::tools::read_file::resolve_path;

pub async fn grep(
    workspace_root: &str,
    pattern: &str,
    glob: Option<&str>,
) -> KoreResult<String> {
    let re = Regex::new(pattern).map_err(|e| KoreError::MissingArg(e.to_string()))?;
    let root = resolve_path(workspace_root, ".")?;
    let glob_pattern = glob.unwrap_or("*");

    let mut matches = Vec::new();
    for entry in WalkDir::new(&root).into_iter().filter_map(|e| e.ok()) {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let rel = path
            .strip_prefix(&root)
            .unwrap_or(path)
            .to_string_lossy()
            .replace('\\', "/");
        if !glob_match(glob_pattern, &rel) {
            continue;
        }
        let content = match tokio::fs::read_to_string(path).await {
            Ok(c) => c,
            Err(_) => continue,
        };
        for (i, line) in content.lines().enumerate() {
            if re.is_match(line) {
                matches.push(format!("{}:{}:{}", rel, i + 1, line));
            }
        }
    }

    Ok(matches.join("\n"))
}

fn glob_match(pattern: &str, path: &str) -> bool {
    if pattern == "*" {
        return true;
    }
    path.ends_with(pattern.trim_start_matches('*'))
}
