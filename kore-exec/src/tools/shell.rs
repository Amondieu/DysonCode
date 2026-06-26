use std::process::Stdio;
use std::time::Duration;

use tokio::process::Command;
use tokio::time::timeout;

use crate::error::{KoreError, KoreResult};

const DEFAULT_TIMEOUT_MS: u64 = 30_000;

#[cfg(unix)]
fn shell_program() -> (&'static str, &'static [&'static str]) {
    ("sh", &["-c"])
}

#[cfg(windows)]
fn shell_program() -> (&'static str, &'static [&'static str]) {
    ("cmd", &["/C"])
}

pub async fn shell(workspace_root: &str, command: &str, timeout_ms: Option<u64>) -> KoreResult<String> {
    let limit = Duration::from_millis(timeout_ms.unwrap_or(DEFAULT_TIMEOUT_MS));

    let root = std::path::Path::new(workspace_root)
        .canonicalize()
        .map_err(|e| KoreError::FileRead {
            path: workspace_root.to_string(),
            source: e,
        })?;

    let (program, prefix_args) = shell_program();
    let mut cmd = Command::new(program);
    for arg in prefix_args {
        cmd.arg(arg);
    }
    cmd.arg(command)
        .current_dir(&root)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let future = cmd.output();

    let output = timeout(limit, future)
        .await
        .map_err(|_| KoreError::ShellTimeout {
            timeout_ms: limit.as_millis() as u64,
        })?
        .map_err(|e| KoreError::ShellFailed {
            exit_code: -1,
            stderr: e.to_string(),
        })?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    if output.status.success() {
        Ok(stdout)
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        Err(KoreError::ShellFailed {
            exit_code: output.status.code().unwrap_or(-1),
            stderr: if stderr.is_empty() { stdout.clone() } else { stderr },
        })
    }
}
