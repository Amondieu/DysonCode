use std::io::{self, Read};

use kore_exec::dispatch;
use kore_exec::protocol::ToolCallInput;

#[tokio::main]
async fn main() {
    let code = run().await;
    std::process::exit(code);
}

async fn run() -> i32 {
    let mut stdin = String::new();
    if let Err(e) = io::stdin().read_to_string(&mut stdin) {
        eprintln!("{{\"status\":\"error\",\"error\":\"stdin read failed: {e}\"}}");
        return 1;
    }

    let input: ToolCallInput = match serde_json::from_str(&stdin) {
        Ok(v) => v,
        Err(e) => {
            let out = kore_exec::protocol::ToolResultOutput::error(
                format!("JSON parse error: {e}"),
                0.0,
            );
            println!("{}", serde_json::to_string(&out).unwrap_or_default());
            return 1;
        }
    };

    let out = dispatch(input).await;
    let is_ok = out.status == "ok";
    println!("{}", serde_json::to_string(&out).unwrap_or_default());
    if is_ok { 0 } else { 1 }
}
