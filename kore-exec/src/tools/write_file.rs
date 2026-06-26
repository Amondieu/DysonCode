use crate::error::{KoreError, KoreResult};
use crate::tools::read_file::resolve_path;

pub async fn write_file(workspace_root: &str, path: &str, content: &str) -> KoreResult<String> {
    let resolved = resolve_path(workspace_root, path)?;
    if let Some(parent) = resolved.parent() {
        tokio::fs::create_dir_all(parent).await.map_err(|e| KoreError::FileWrite {
            path: path.to_string(),
            source: e,
        })?;
    }
    tokio::fs::write(&resolved, content)
        .await
        .map_err(|e| KoreError::FileWrite {
            path: path.to_string(),
            source: e,
        })?;
    Ok(format!("wrote {} bytes", content.len()))
}
