/**
 * DSML Tool Call Parser — strips tool-call markup from LLM output
 * and extracts structured tool calls for execution.
 *
 * Handles both formats:
 *   Plain:   <tool_calls><invoke name="read"><parameter name="filePath">...</parameter></invoke></tool_calls>
 *   NS'd:    <||DSML||tool_calls><||DSML||invoke name="read"><||DSML||parameter name="filePath">...</||DSML||parameter></||DSML||invoke></||DSML||tool_calls>
 */

// ── Interface (compatible with fix-toolbridge.ps1 contract) ──
export interface ToolCall { name: string; params: Record<string, string>; }

// Legacy interface for ChatPanel backward compat
export interface ParsedResponse { text: string; toolCalls: ToolCall[]; }

/**
 * Parse DSML tool calls from LLM raw output.
 * Also exported as `parseToolCalls` for backward compat.
 */
export function parseDSML(raw: string): { text: string; calls: ToolCall[] } {
  const calls: ToolCall[] = [];

  // Match both <||DSML||tool_calls> and plain <tool_calls> blocks
  const text = raw.replace(
    /<(?:\|\|DSML\|\|)?tool_calls>([\s\S]*?)<\/(?:\|\|DSML\|\|)?tool_calls>/g,
    (_, block: string) => {
      // Match both <||DSML||invoke name="X"> and <invoke name="X">
      const inv = /<(?:\|\|DSML\|\|)?invoke name="([^"]+)">([\s\S]*?)<\/(?:\|\|DSML\|\|)?invoke>/g;
      let m: RegExpExecArray | null;
      while ((m = inv.exec(block)) !== null) {
        const params: Record<string, string> = {};
        // Match both <||DSML||parameter ...> and <parameter ...>
        const par = /<(?:\|\|DSML\|\|)?parameter name="([^"]+)"[^>]*>([\s\S]*?)<\/(?:\|\|DSML\|\|)?parameter>/g;
        let p: RegExpExecArray | null;
        const parCopy = new RegExp(par.source, par.flags);
        while ((p = parCopy.exec(m[2])) !== null) params[p[1]] = p[2].trim();
        calls.push({ name: m[1], params });
      }
      return '';
    }
  ).trim();

  return { text, calls };
}

/**
 * Backward-compatible alias for ChatPanel.tsx which imports `parseToolCalls`.
 */
export function parseToolCalls(raw: string): ParsedResponse {
  const { text, calls } = parseDSML(raw);
  return { text, toolCalls: calls };
}

/**
 * Execute a single tool call through the preload bridge.
 * Uses window.api if available, falls back to window.dyson.
 */
/**
 * Execute a single tool call.
 * Primary: kore-exec Rust subprocess (window.kore.execute)
 * Fallback: Electron IPC preload bridge (window.api or window.dyson)
 */
export async function runTool(call: ToolCall): Promise<string> {
  // Try kore-exec first (Rust subprocess)
  const kore = (window as any).kore;
  if (kore?.execute) {
    const koreResult = await kore.execute(call.name, call.params).catch(() => null);
    // If kore-exec succeeded (no error), return its output
    if (koreResult && !koreResult.error && koreResult.output) {
      return koreResult.output;
    }
    // If kore-exec returned an error that's NOT about binary not found, show it
    if (koreResult?.error && !/not found|ENOENT|spawn/i.test(koreResult.error)) {
      return `KORE ERROR: ${koreResult.error}`;
    }
    // Otherwise (binary not found, spawn failed): fall through to IPC
  }

  // Fallback: Electron IPC preload bridge
  const api = (window as any).api ?? (window as any).dyson;
  try {
    if (call.name === 'read') {
      const filePath = call.params.filePath;
      if (!filePath) return 'ERROR: filePath parameter required';
      const r = await api.readFile(filePath);
      if (typeof r === 'string') return r;
      return r.ok ? r.content : 'ERROR: ' + r.error;
    }
    if (call.name === 'write') {
      const r = await api.saveFile(call.params.filePath, call.params.content);
      if (typeof r === 'undefined' || r?.ok !== false) return 'Written: ' + call.params.filePath;
      return 'ERROR: ' + (r?.error ?? 'unknown');
    }
    if (call.name === 'list' || call.name === 'listDir') {
      const dirPath = call.params.path ?? call.params.dirPath ?? '.';
      const r = await api.listDir(dirPath);
      if (!r.ok) return 'ERROR: ' + r.error;
      return r.entries.map((e: any) => (e.isDir ? '[DIR] ' : '[FILE] ') + e.name).join('\n');
    }
    if (call.name === 'shell') {
      const cmd = call.params.command ?? call.params.cmd;
      if (!cmd) return 'ERROR: command parameter required';
      const r = await api.shellExec(cmd);
      return r.output ?? r.stdout ?? String(r);
    }
    return 'Unknown tool: ' + call.name;
  } catch (e) { return 'TOOL EXCEPTION: ' + (e as Error).message; }
}
