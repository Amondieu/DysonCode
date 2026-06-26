use std::path::{Component, Path, PathBuf};

use crate::error::{KoreError, KoreResult};

pub fn resolve_path(workspace_root: &str, relative: &str) -> KoreResult<PathBuf> {
    let root = Path::new(workspace_root)
        .canonicalize()
        .map_err(|e| KoreError::FileRead {
            path: workspace_root.to_string(),
            source: e,
        })?;

    let joined = root.join(relative);
    let normalized = normalize_path(&joined);

    if !normalized.starts_with(&root) {
        return Err(KoreError::PathEscape {
            path: relative.to_string(),
        });
    }

    Ok(normalized)
}

fn normalize_path(path: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for component in path.components() {
        match component {
            Component::ParentDir => {
                out.pop();
            }
            Component::CurDir => {}
            other => out.push(other),
        }
    }
    out
}

pub async fn read_file(workspace_root: &str, path: &str) -> KoreResult<String> {
    let resolved = resolve_path(workspace_root, path)?;
    tokio::fs::read_to_string(&resolved)
        .await
        .map_err(|e| KoreError::FileRead {
            path: path.to_string(),
            source: e,
        })
}
