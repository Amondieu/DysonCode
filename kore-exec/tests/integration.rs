use kore_exec::dispatch;
use kore_exec::protocol::ToolCallInput;
use tempfile::tempdir;

#[tokio::test]
async fn write_and_read_roundtrip() {
    let dir = tempdir().unwrap();
    let root = dir.path().to_string_lossy().to_string();

    let write = ToolCallInput {
        version: Some(1),
        tool: "write_file".to_string(),
        args: serde_json::json!({
            "path": "hello.txt",
            "content": "kore-exec"
        }),
        workspace_root: root.clone(),
        node_id: "t1".to_string(),
        role: "builder".to_string(),
    };
    let w = dispatch(write).await;
    assert_eq!(w.status, "ok");

    let read = ToolCallInput {
        version: Some(1),
        tool: "read_file".to_string(),
        args: serde_json::json!({ "path": "hello.txt" }),
        workspace_root: root,
        node_id: "t1".to_string(),
        role: "builder".to_string(),
    };
    let r = dispatch(read).await;
    assert_eq!(r.status, "ok");
    assert_eq!(r.output, "kore-exec");
}

#[tokio::test]
async fn path_escape_blocked() {
    let dir = tempdir().unwrap();
    let root = dir.path().to_string_lossy().to_string();

    let call = ToolCallInput {
        version: Some(1),
        tool: "read_file".to_string(),
        args: serde_json::json!({ "path": "../../../etc/passwd" }),
        workspace_root: root,
        node_id: "t2".to_string(),
        role: "builder".to_string(),
    };
    let r = dispatch(call).await;
    assert_eq!(r.status, "error");
    assert!(r.error.unwrap().contains("escapes workspace"));
}
