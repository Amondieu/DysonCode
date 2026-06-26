/**
 * Tool Registry — dispatches parsed DSML tool calls to actual implementations.
 *
 * Uses existing Electron IPC handlers:
 *   - fs:readFile  → reads a file from disk
 *   - fs:saveFile  → writes a file to disk
 *   - shell:exec   → runs a shell command
 */

import type { ToolCall } from './dsml-parser';

interface ToolResult {
  name: string;
  success: boolean;
  output: string;
}

// ── Tool Implementations ────────────────────────────────────────────────────

// ── Preload bridge (window.dyson is exposed by preload.ts) ──────────────────
function dyson() {
  return (window as any).dyson;
}

async function toolRead(params: Record<string, string>): Promise<string> {
  const filePath = params.filePath || params.path || '';
  if (!filePath) return 'Error: filePath parameter required';
  try {
    const content = await dyson().readFile(filePath);
    return String(content);
  } catch (err) {
    return `Error reading file: ${(err as Error).message}`;
  }
}

async function toolWrite(params: Record<string, string>): Promise<string> {
  const filePath = params.filePath || params.path || '';
  const content = params.content || '';
  if (!filePath) return 'Error: filePath parameter required';
  try {
    await dyson().saveFile(filePath, content);
    return `File written: ${filePath}`;
  } catch (err) {
    return `Error writing file: ${(err as Error).message}`;
  }
}

async function toolShell(params: Record<string, string>): Promise<string> {
  const command = params.command || params.cmd || '';
  if (!command) return 'Error: command parameter required';
  try {
    const result = await dyson().shell.exec({
      cwd: params.cwd || '.',
      cmd: command,
    });
    return result?.stdout || result?.output || String(result);
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

async function toolSearch(params: Record<string, string>): Promise<string> {
  const pattern = params.pattern || params.query || '';
  const filePath = params.filePath || params.path || '.';
  if (!pattern) return 'Error: pattern parameter required';
  try {
    return `Search for "${pattern}" in ${filePath} — use shell grep or read individual files.`;
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

// ── Registry ────────────────────────────────────────────────────────────────

async function toolListDir(params: Record<string, string>): Promise<string> {
  const dirPath = params.path || params.dirPath || '.';
  try {
    const entries = await dyson().listFiles(dirPath);
    return entries
      .map((e: any) => `${e.isDirectory ? '[DIR] ' : '[FILE]'} ${e.name}`)
      .join('\n');
  } catch (err) {
    return `Error listing directory: ${(err as Error).message}`;
  }
}

const TOOL_REGISTRY: Record<string, (params: Record<string, string>) => Promise<string>> = {
  read: toolRead,
  write: toolWrite,
  shell: toolShell,
  search: toolSearch,
  list: toolListDir,
  listDir: toolListDir,
};

// ── Public API ──────────────────────────────────────────────────────────────

export async function executeToolCalls(toolCalls: ToolCall[]): Promise<ToolResult[]> {
  return Promise.all(
    toolCalls.map(async (call) => {
      const handler = TOOL_REGISTRY[call.name];
      if (!handler) {
        return { name: call.name, success: false, output: `[Tool "${call.name}" not found]` };
      }
      try {
        const output = await handler(call.params);
        return { name: call.name, success: true, output: `[Tool: ${call.name}]\n${output}` };
      } catch (err) {
        return {
          name: call.name,
          success: false,
          output: `[Tool: ${call.name} FAILED]\n${(err as Error).message}`,
        };
      }
    }),
  );
}
