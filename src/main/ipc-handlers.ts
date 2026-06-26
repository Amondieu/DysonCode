import * as fs from 'fs';
import * as path from 'path';
import { exec as execCallback, execFile } from 'child_process';
import { promisify } from 'util';
import {
  createSession,
  createPromptVaultEntry,
  deletePromptVaultEntry,
  getAllSessions,
  getSessionById,
  getPromptVault,
  updateSessionTitle,
  deleteSession,
  insertMessage,
  getMessagesBySession,
  getLastSessionWithMessages,
  recordPromptVaultUse,
  setPromptVaultPinned,
  upsertSessionSummary,
  getSessionSummary,
} from './db';
import { terminalManager } from './terminal-manager';
import { missionControlManager } from './mission-control-manager';
import { importVaultFromFile } from './vault-import';
import { executeAgent } from './agent-executor';
import * as GraphService from './graph-service';
import { registerPipelineHandlers } from './kore-pipeline';
import { registerMemoryHandlers } from './kore-memory';
import { runJcode, runJcodeStreaming } from './jcode-client';

const execAsync = promisify(execCallback);

export function registerIpcHandlers() {
  registerPipelineHandlers();
  registerMemoryHandlers();
  const electron = require('electron');
  const { ipcMain, dialog, BrowserWindow } = electron;

  // ---- DB: Sessions ----
  ipcMain.handle('db:createSession', async (_e: any, title: string, repoPath?: string) => {
    return createSession(title, repoPath);
  });

  ipcMain.handle('db:getAllSessions', async () => getAllSessions());
  ipcMain.handle('db:getSessionById', async (_e: any, id: number) => getSessionById(id));

  ipcMain.handle('db:updateSessionTitle', async (_e: any, id: number, title: string) => {
    updateSessionTitle(id, title);
  });

  ipcMain.handle('db:deleteSession', async (_e: any, id: number) => {
    deleteSession(id);
  });

  // ---- DB: Messages ----
  ipcMain.handle(
    'db:insertMessage',
    async (_e: any, sessionId: number, role: string, content: string, toolCalls?: string, toolResults?: string) => {
      return insertMessage(sessionId, role as any, content, toolCalls, toolResults);
    }
  );

  ipcMain.handle('db:getMessagesBySession', async (_e: any, sessionId: number) => {
    return getMessagesBySession(sessionId);
  });

  ipcMain.handle('db:getLastSessionWithMessages', async () => {
    return getLastSessionWithMessages();
  });

  // ---- DB: Summaries ----
  ipcMain.handle(
    'db:upsertSessionSummary',
    async (_e: any, sessionId: number, summary: string, keyFiles?: string, keyDecisions?: string) => {
      upsertSessionSummary(sessionId, summary, keyFiles, keyDecisions);
    }
  );

  ipcMain.handle('db:getSessionSummary', async (_e: any, sessionId: number) => {
    return getSessionSummary(sessionId);
  });

  // ---- Prompt Vault ----
  ipcMain.handle('vault:list', async (_e: any, search?: string) => {
    return getPromptVault(search || '');
  });

  ipcMain.handle(
    'vault:create',
    async (_e: any, title: string, taskType: string, version: string, tagsJson: string, template: string) => {
      return createPromptVaultEntry(title, taskType, version, tagsJson, template);
    }
  );

  ipcMain.handle('vault:setPinned', async (_e: any, id: number, pinned: boolean) => {
    await setPromptVaultPinned(id, pinned);
  });

  ipcMain.handle('vault:recordUse', async (_e: any, id: number) => {
    await recordPromptVaultUse(id);
  });

  ipcMain.handle('vault:delete', async (_e: any, id: number) => {
    await deletePromptVaultEntry(id);
  });

  ipcMain.handle('vault:pickImportFile', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: 'JSON Files', extensions: ['json'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('vault:importFromFile', async (_e: any, filePath: string) => {
    return importVaultFromFile(filePath);
  });

  // ---- Graph ----
  ipcMain.handle('graph:getGraph', async (_e: any, sessionId: string, mode: GraphService.GraphMode) => {
    return GraphService.getGraph(sessionId, mode);
  });

  ipcMain.handle('graph:createNode', async (_e: any, args: GraphService.CreateNodeArgs) => {
    return GraphService.createNode(args);
  });

  ipcMain.handle('graph:updateNode', async (_e: any, args: GraphService.UpdateNodeArgs) => {
    await GraphService.updateNode(args);
    return { ok: true };
  });

  ipcMain.handle('graph:deleteNode', async (_e: any, nodeId: string) => {
    await GraphService.deleteNode(nodeId);
    return { ok: true };
  });

  ipcMain.handle('graph:createEdge', async (_e: any, args: GraphService.CreateEdgeArgs) => {
    return GraphService.createEdge(args);
  });

  ipcMain.handle('graph:deleteEdge', async (_e: any, edgeId: string) => {
    await GraphService.deleteEdge(edgeId);
    return { ok: true };
  });

  ipcMain.handle('graph:updateLayout', async (_e: any, views: GraphService.NodeViewUpdate[]) => {
    await GraphService.updateLayout(views);
    return { ok: true };
  });

  ipcMain.handle('graph:logExecution', async (_e: any, args: GraphService.LogExecutionArgs) => {
    await GraphService.logExecution(args);
    return { ok: true };
  });

  ipcMain.handle('graph:getExecutionLog', async (_e: any, sessionId: string, nodeId?: string | null, limit?: number) => {
    return GraphService.getExecutionLog(sessionId, nodeId, limit ?? 20);
  });

  ipcMain.handle('agent:execute', async (_e: any, args: { sessionId: string; nodeId: string; prompt: string; model?: string; context?: string }) => {
    return executeAgent(args);
  });

  ipcMain.handle('shell:exec', async (_e: any, args: string | { cwd: string; cmd: string }) => {
    // Accept both string-only (fix-toolbridge contract) and {cwd, cmd} object
    const cmd: string = typeof args === 'string' ? args : args.cmd;
    const cwd: string = typeof args === 'string' ? process.cwd() : (args.cwd || process.cwd());
    const startedAt = Date.now();
    try {
      const { stdout, stderr } = await execAsync(cmd, {
        cwd,
        timeout: 60_000,
        windowsHide: true,
        maxBuffer: 1024 * 1024 * 8,
      });
      return {
        ok: true,
        output: stdout,
        stdout,
        stderr,
        exitCode: 0,
        durationMs: Date.now() - startedAt,
      };
    } catch (error: any) {
      return {
        ok: false,
        output: String(error?.stderr || error?.message || ''),
        stdout: String(error?.stdout || ''),
        stderr: String(error?.stderr || error?.message || ''),
        exitCode: typeof error?.code === 'number' ? error.code : 1,
        durationMs: Date.now() - startedAt,
      };
    }
  });

  // ---- Terminal ----
  ipcMain.handle('terminal:create', (_e: any, title?: string) => {
    const session = terminalManager.create(title);
    return { id: session.id, title: session.title };
  });

  ipcMain.handle('terminal:write', (_e: any, id: string, data: string) => {
    terminalManager.write(id, data);
  });

  ipcMain.handle('terminal:resize', (_e: any, id: string, cols: number, rows: number) => {
    terminalManager.resize(id, cols, rows);
  });

  ipcMain.handle('terminal:kill', (_e: any, id: string) => {
    terminalManager.kill(id);
  });

  ipcMain.handle('terminal:list', () => {
    return terminalManager.list().map((s) => ({ id: s.id, title: s.title }));
  });

  // Forward terminal events
  terminalManager.on('data', (data) => {
    const wins = BrowserWindow.getAllWindows();
    for (const win of wins) {
      win.webContents.send('terminal:data', data);
    }
  });

  terminalManager.on('exit', (data) => {
    const wins = BrowserWindow.getAllWindows();
    for (const win of wins) {
      win.webContents.send('terminal:exit', data);
    }
  });

  missionControlManager.on('snapshot', (data) => {
    const wins = BrowserWindow.getAllWindows();
    for (const win of wins) {
      win.webContents.send('mission-control:snapshot', data);
    }
  });

  missionControlManager.on('status', (data) => {
    const wins = BrowserWindow.getAllWindows();
    for (const win of wins) {
      win.webContents.send('mission-control:status', data);
    }
  });

  ipcMain.handle(
    'missionControl:start',
    (_e: any, spec: string, workspaceRoot: string, maxSteps = 2, executeBuilder = false) => {
      return missionControlManager.start(spec, workspaceRoot, maxSteps, executeBuilder);
    }
  );

  ipcMain.handle('missionControl:stop', () => {
    return missionControlManager.stop();
  });

  ipcMain.handle('missionControl:getState', () => {
    return missionControlManager.getState();
  });

  ipcMain.handle('missionControl:getStatus', () => {
    return missionControlManager.getStatus();
  });

  // ---- File System ----
  ipcMain.handle('fs:selectDirectory', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('fs:listFiles', (_e: any, dirPath: string) => {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    return entries
      .filter((e) => !e.name.startsWith('.') || e.name === '.git')
      .map((e) => ({
        name: e.name,
        path: path.join(dirPath, e.name),
        isDirectory: e.isDirectory(),
      }))
      .sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  });

  ipcMain.handle('fs:readFile', async (_e: any, filePath: string) => {
    try {
      return { ok: true, content: fs.readFileSync(filePath, 'utf-8') };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });

  ipcMain.handle('fs:saveFile', (_e: any, filePath: string, content: string) => {
    fs.writeFileSync(filePath, content, 'utf-8');
  });

  ipcMain.handle('fs:isDirectory', (_e: any, filePath: string) => {
    try {
      return fs.statSync(filePath).isDirectory();
    } catch {
      return false;
    }
  });

  ipcMain.handle('fs:listDir', async (_e: any, dirPath: string) => {
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      return {
        ok: true,
        entries: entries.map((e) => ({
          name: e.name,
          isDir: e.isDirectory(),
        })),
      };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });

  // ---- Panel Manager (unified WebContentsView coordinator) ----
  // All panel visibility, bounds, and navigation go through one gate.
  // initPanelManager() must be called in index.js before these handlers fire.
  // (panels:* IPC handlers are registered inside panel-manager.ts)

  // ---- Repos ----
  ipcMain.handle('repos:scan', async (_e: any, dirPath: string) => {
    // Scan the given directory for git repositories
    const repos: Array<{ name: string; path: string; lastUsed: string }> = [];
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          const gitDir = path.join(dirPath, entry.name, '.git');
          if (fs.existsSync(gitDir)) {
            // Get last commit time as lastUsed
            let lastUsed = new Date().toISOString();
            try {
              const headRef = fs.readFileSync(path.join(gitDir, 'HEAD'), 'utf-8').trim();
              if (headRef.startsWith('ref: ')) {
                const refPath = path.join(gitDir, headRef.slice(5));
                if (fs.existsSync(refPath)) {
                  const refContent = fs.readFileSync(refPath, 'utf-8').trim();
                  // No reliable timestamp from packed-refs, just use mtime of HEAD
                }
              }
              // Use the HEAD modification time as a heuristic
              const stat = fs.statSync(gitDir);
              lastUsed = stat.mtime.toISOString();
            } catch {}
            repos.push({
              name: entry.name,
              path: path.resolve(dirPath, entry.name),
              lastUsed,
            });
          }
        }
      }
    } catch (err) {
      console.error('[repos:scan] error:', (err as Error).message);
    }
    return repos;
  });

  ipcMain.handle('repos:browse', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    return result.filePaths[0];
  });

  // ---- Repo Context ----
  ipcMain.handle('repo:getContext', async (_e: any, workspaceRoot: string) => {
    const { getCachedContext, refreshContext } = require('./repo-context');
    return getCachedContext(workspaceRoot);
  });

  ipcMain.handle('repo:refreshContext', async (_e: any, workspaceRoot: string) => {
    const { refreshContext } = require('./repo-context');
    return refreshContext(workspaceRoot);
  });

  // ---- Repo Primer (injected before first jcode message) ----
  ipcMain.handle('repo:getPrimer', async (_e: any, workspaceRoot: string) => {
    const { buildPrimer, refreshContext } = require('./repo-context');
    try {
      const ctx = refreshContext(workspaceRoot);
      const primer = buildPrimer(ctx);
      // Cap at 2000 tokens (~8000 chars)
      return primer.length > 8000 ? primer.slice(0, 8000) + '\n... (truncated)' : primer;
    } catch {
      return '';
    }
  });

  // ---- DysonSphere Intelligence ----
  ipcMain.handle('dyson:getIntelligence', async () => {
    const { getCachedIntelligence } = require('./intelligence/bridge');
    return getCachedIntelligence();
  });

  ipcMain.handle('dyson:refreshIntelligence', async () => {
    const { refreshIntelligence } = require('./intelligence/bridge');
    return refreshIntelligence();
  });

  // ---- App ----
  ipcMain.handle('app:getVersion', () => {
    return electron.app.getVersion();
  });

  ipcMain.handle('app:openBrowser', async (_e: any, url?: string) => {
    const target = url || 'https://www.google.com';
    const { shell } = electron;
    await shell.openExternal(target);
  });

  ipcMain.handle('app:openVSCode', async (_e: any, repoPath?: string) => {
    const { exec } = require('child_process');
    const cwd = repoPath || process.cwd();
    exec(`code "${cwd}"`, (err: Error | null) => {
      if (err) console.warn('[vscode] launch failed:', err.message);
    });
  });

  ipcMain.handle('app:openCursor', async (_e: any, repoPath?: string) => {
    const { exec } = require('child_process');
    const cwd = repoPath || process.cwd();
    exec(`cursor "${cwd}"`, (err: Error | null) => {
      if (err) console.warn('[cursor] launch failed:', err.message);
    });
  });

  ipcMain.handle('app:openEmbeddedBrowser', (_e: any, url: string) => {
    const win = new BrowserWindow({
      width: 1200,
      height: 800,
      title: 'Browser',
      webPreferences: { contextIsolation: true, nodeIntegration: false },
    });
    win.loadURL(url || 'https://www.google.com');
    return { id: win.id };
  });

  // ---- Jcode Bridge ----
  ipcMain.handle('jcode:send', async (_e: any, message: string, repoPath?: string) => {
    const { missionControlManager } = require('./mission-control-manager');
    const spec = `MODULE: jcode-chat\n# Sent from chat\n${message.slice(0, 2000)}`;
    missionControlManager.start(spec, repoPath || '.', 5, true);
    return { status: 'sent' };
  });

  // ── Kore-exec Subprocess Bridge ────────────────────────────────────────────
  ipcMain.handle('kore:execute', async (_e: any, payload: {
    tool: string;
    args: Record<string, string>;
    workspaceRoot?: string;
  }) => {
    // Map DSML tool names to kore-exec tool names
    const TOOL_MAP: Record<string, string> = {
      read: 'read_file',
      write: 'write_file',
      shell: 'shell',
      search: 'grep',
      list: 'shell',
    };

    // Map DSML param names to kore-exec arg names
    function mapArgs(tool: string, args: Record<string, string>): Record<string, string> {
      if (tool === 'read' || tool === 'write') {
        return { path: args.filePath || args.path || '.', content: args.content || '' };
      }
      if (tool === 'shell') {
        return { command: args.command || args.cmd || '' };
      }
      if (tool === 'search') {
        return { pattern: args.pattern || args.query || '', glob: args.glob || '' };
      }
      if (tool === 'list') {
        const dir = args.path || args.dirPath || '.';
        // Use shell dir command as fallback since kore-exec has no native list
        return { command: `cmd /c "dir /b \"${dir.replace(/"/g, '\\"')}\""` };
      }
      return args;
    }

    const koreTool = TOOL_MAP[payload.tool];
    if (!koreTool) {
      return { status: 'error', output: '', error: `Unknown tool: ${payload.tool}` };
    }

    const workspaceRoot = payload.workspaceRoot || process.cwd();

    // Find kore-exec binary
    const koreExecPath = findKoreExec();
    if (koreExecPath && fs.existsSync(koreExecPath)) {
      // ── Rust subprocess path ─────────────────────────────────────────────
      return new Promise(resolve => {
        const input = JSON.stringify({
          version: 1,
          tool: koreTool,
          args: mapArgs(payload.tool, payload.args),
          workspace_root: workspaceRoot,
          node_id: 'jcode-agent',
          role: 'auto',
        });

        const proc = execFile(koreExecPath, [], {
          timeout: 60_000,
          maxBuffer: 1024 * 1024 * 8,
        }, (err, stdout, stderr) => {
          if (err && !stdout) {
            resolve({ status: 'error', output: stderr || err.message || '', error: err.message });
            return;
          }
          try { resolve(JSON.parse(stdout)); }
          catch { resolve({ status: 'ok', output: stdout || stderr || '' }); }
        });

        proc.stdin?.write(input);
        proc.stdin?.end();
      });
    }

    // ── Fallback: Electron IPC (Node.js) ──────────────────────────────────
    // Used when kore-exec binary is not available (dev without Rust build)
    const ipcHandlers: Record<string, (args: Record<string, string>) => Promise<{ status: string; output: string }>> = {
      read_file: async (args) => {
        try {
          const content = fs.readFileSync(path.resolve(workspaceRoot, args.path || '.'), 'utf-8');
          return { status: 'ok', output: content };
        } catch (e) { return { status: 'error', output: (e as Error).message }; }
      },
      write_file: async (args) => {
        try {
          const filePath = path.resolve(workspaceRoot, args.path || '.');
          fs.mkdirSync(path.dirname(filePath), { recursive: true });
          fs.writeFileSync(filePath, args.content || '', 'utf-8');
          return { status: 'ok', output: `Written: ${args.path}` };
        } catch (e) { return { status: 'error', output: (e as Error).message }; }
      },
      shell: async (args) => {
        return new Promise(resolve => {
          execCallback(args.command || '', {
            cwd: workspaceRoot,
            timeout: 60_000,
            maxBuffer: 1024 * 1024 * 8,
            windowsHide: true,
          }, (err: Error | null, stdout: string, stderr: string) => {
            resolve({
              status: err ? 'error' : 'ok',
              output: stdout || stderr || (err?.message ?? ''),
            });
          });
        });
      },
      grep: async (args) => {
        const pattern = args.pattern || '';
        const glob = args.glob || '*';
        return new Promise(resolve => {
          execCallback(`findstr /s /i "${pattern.replace(/"/g, '\\"')}" "${glob}"`, {
            cwd: workspaceRoot,
            timeout: 30_000,
          }, (err: Error | null, stdout: string, stderr: string) => {
            resolve({
              status: err ? 'error' : 'ok',
              output: stdout || stderr || (err?.message ?? ''),
            });
          });
        });
      },
    };

    const handler = ipcHandlers[koreTool];
    if (handler) return handler(mapArgs(payload.tool, payload.args));
    return { status: 'error', output: '', error: `No handler for: ${koreTool}` };
  });

  // ── Real jcode v0.29.0+ bridge ─────────────────────────────────────────────
  ipcMain.handle('jcode:run', async (_e: any, payload: {
    message: string;
    provider?: string;
    model?: string;
    cwd?: string;
  }) => {
    try {
      const events = await runJcode(payload.message, {
        provider: payload.provider,
        model: payload.model,
        cwd: payload.cwd,
      });
      return { ok: true, events };
    } catch (e) {
      return { ok: false, error: (e as Error).message, events: [] };
    }
  });

  // ── Streaming jcode bridge ─────────────────────────────────────────────────
  // Each NDJSON event is forwarded to the renderer in real time via webContents.send.
  // The renderer subscribes via electronAPI.on('jcode:event') → useChatStream.ts.
  const activeStreams = new Map<string, import('child_process').ChildProcess>();

  ipcMain.on('jcode:run-stream', (event: any, payload: {
    msgId: string;
    message: string;
    model?: string;
    cwd?: string;
  }) => {
    const win = event.sender.getOwnerBrowserWindow?.() || require('electron').BrowserWindow.fromWebContents(event.sender);
    if (!win) return;

    const { msgId, message, model, cwd } = payload;

    const proc = runJcodeStreaming(message, (evt) => {
      try {
        win.webContents.send('jcode:event', { msgId, event: evt });
      } catch {}
    }, { model, cwd });

    activeStreams.set(msgId, proc);

    proc.on('close', (_code: number | null) => {
      activeStreams.delete(msgId);
      try {
        win.webContents.send('jcode:done-stream', { msgId });
      } catch {}
    });
  });

  // ── Cancel a streaming jcode process ──────────────────────────────────────
  ipcMain.on('jcode:cancel-stream', (event: any, payload: { msgId: string }) => {
    const proc = activeStreams.get(payload.msgId);
    if (proc) {
      try { proc.kill(); } catch {}
      activeStreams.delete(payload.msgId);
    }
  });
}

function findKoreExec(): string | null {
  const candidates: string[] = [];

  // 1. process.resourcesPath — most reliable in packaged Electron
  if (process.resourcesPath) {
    candidates.push(path.join(process.resourcesPath, 'kore-exec.exe'));
    candidates.push(path.join(process.resourcesPath, 'kore-exec'));
  }

  // 2. Development: relative to dist/main/
  candidates.push(path.join(__dirname, '../../kore-exec/target/release/kore-exec.exe'));
  candidates.push(path.join(__dirname, '../../kore-exec/target/release/kore-exec'));

  // 3. Packaged: traverse up from app.asar/dist/main/ → resources/
  candidates.push(path.join(__dirname, '../../../kore-exec.exe'));

  // 4. Same directory as the main process file
  candidates.push(path.join(__dirname, 'kore-exec.exe'));
  candidates.push(path.join(__dirname, 'kore-exec'));

  // 5. Resources relative to various asar depth levels
  candidates.push(path.join(__dirname, '../resources/kore-exec.exe'));
  candidates.push(path.join(__dirname, '../resources/kore-exec'));
  candidates.push(path.join(__dirname, '../../resources/kore-exec.exe'));
  candidates.push(path.join(__dirname, '../../resources/kore-exec'));

  // 6. Working directory resources/
  try { candidates.push(path.join(process.cwd(), 'resources', 'kore-exec.exe')); } catch {}

  // 7. PATH
  candidates.push('kore-exec');
  candidates.push('kore-exec.exe');

  // Try each candidate
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        console.log('[kore-exec] found at:', candidate);
        return path.resolve(candidate);
      }
    } catch {}
  }

  // Absolute last resort
  console.warn('[kore-exec] binary not found on any path');
  return null;
}
