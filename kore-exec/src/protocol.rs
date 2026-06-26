use serde::{Deserialize, Serialize};

pub const PROTOCOL_VERSION: u32 = 1;

#[derive(Debug, Deserialize)]
pub struct ToolCallInput {
    pub version: Option<u32>,
    pub tool: String,
    pub args: serde_json::Value,
    pub workspace_root: String,
    pub node_id: String,
    pub role: String,
}

#[derive(Debug, Serialize)]
pub struct ToolResultOutput {
    pub status: String,
    pub output: String,
    pub exit_code: i32,
    pub duration_ms: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl ToolResultOutput {
    pub fn ok(output: String, duration_ms: f64) -> Self {
        Self {
            status: "ok".to_string(),
            output,
            exit_code: 0,
            duration_ms,
            error: None,
        }
    }

    pub fn error(message: String, duration_ms: f64) -> Self {
        Self {
            status: "error".to_string(),
            output: String::new(),
            exit_code: 1,
            duration_ms,
            error: Some(message),
        }
    }
}
