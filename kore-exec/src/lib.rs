pub mod error;
pub mod protocol;
pub mod tools;

use std::time::Instant;

use error::{KoreError, KoreResult};
use protocol::{ToolCallInput, ToolResultOutput};
use tools::{diff, grep, jcode_precheck, read_file, shell, write_file};

pub async fn dispatch(input: ToolCallInput) -> ToolResultOutput {
    let started = Instant::now();
    let result = execute(input).await;
    let duration_ms = started.elapsed().as_secs_f64() * 1000.0;

    match result {
        Ok(output) => ToolResultOutput::ok(output, duration_ms),
        Err(err) => ToolResultOutput::error(err.to_string(), duration_ms),
    }
}

async fn execute(input: ToolCallInput) -> KoreResult<String> {
    let workspace = input.workspace_root.as_str();
    let args = &input.args;

    match input.tool.as_str() {
        "read_file" => {
            let path = arg_str(args, "path")?;
            read_file::read_file(workspace, &path).await
        }
        "write_file" => {
            let path = arg_str(args, "path")?;
            let content = arg_str(args, "content")?;
            write_file::write_file(workspace, &path, &content).await
        }
        "shell" => {
            let command = arg_str(args, "command")?;
            let timeout_ms = args.get("timeout_ms").and_then(|v| v.as_u64());
            shell::shell(workspace, &command, timeout_ms).await
        }
        "grep" => {
            let pattern = arg_str(args, "pattern")?;
            let glob = args.get("glob").and_then(|v| v.as_str());
            grep::grep(workspace, &pattern, glob).await
        }
        "diff" => diff::diff_from_args(args),
        "jcode_precheck" => jcode_precheck::jcode_precheck(args),
        "health" => Ok("ok".to_string()),
        other => Err(KoreError::UnknownTool(other.to_string())),
    }
}

fn arg_str(args: &serde_json::Value, key: &str) -> KoreResult<String> {
    args.get(key)
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| KoreError::MissingArg(key.to_string()))
}
