use thiserror::Error;

#[derive(Error, Debug)]
pub enum KoreError {
    #[error("File read failed: {path} — {source}")]
    FileRead {
        path: String,
        #[source]
        source: std::io::Error,
    },

    #[error("File write failed: {path} — {source}")]
    FileWrite {
        path: String,
        #[source]
        source: std::io::Error,
    },

    #[error("Path escapes workspace: {path}")]
    PathEscape { path: String },

    #[error("Shell command failed: exit={exit_code}, stderr={stderr}")]
    ShellFailed { exit_code: i32, stderr: String },

    #[error("Shell timeout after {timeout_ms}ms")]
    ShellTimeout { timeout_ms: u64 },

    #[error("JSON parse error: {0}")]
    JsonParse(#[from] serde_json::Error),

    #[error("Tool not found: {0}")]
    UnknownTool(String),

    #[error("Missing argument: {0}")]
    MissingArg(String),
}

pub type KoreResult<T> = Result<T, KoreError>;
