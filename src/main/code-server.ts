import { WebContentsView, BrowserWindow } from 'electron';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';

let codeServerView: WebContentsView | null = null;
let codeServerProc: ChildProcess | null = null;
let codeServerPort: number | null = null;
let parentWindow: BrowserWindow | null = null;

export function createCodeServerView(win: BrowserWindow): WebContentsView | null {
  if (codeServerView) return codeServerView;
  parentWindow = win;

  codeServerView = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.contentView.addChildView(codeServerView);

  // If no port yet, start code-server
  if (!codeServerPort) {
    startCodeServer();
  }

  if (codeServerPort) {
    codeServerView.webContents.loadURL(`http://localhost:${codeServerPort}`);
  }

  return codeServerView;
}

function findCodeServerBinary(): string | null {
  // Windows: use VS Code built-in serve-web (code-server has no Windows build)
  const vsCodePath = path.join(
    process.env.LOCALAPPDATA || '',
    'Programs',
    'Microsoft VS Code',
    'bin',
    'code'
  );
  if (fs.existsSync(vsCodePath)) return vsCodePath;
  if (fs.existsSync(vsCodePath + '.cmd')) return vsCodePath + '.cmd';

  // Also check Cursor as fallback
  const cursorPath = path.join(
    process.env.LOCALAPPDATA || '',
    'Programs',
    'cursor',
    'resources',
    'app',
    'bin',
    'code'
  );
  if (fs.existsSync(cursorPath)) return cursorPath;

  return null;
}

function startCodeServer() {
  const workspaceRoot = process.cwd();
  const binary = findCodeServerBinary();
  const isVSCode = binary ? binary.includes('Microsoft VS Code') : false;

  if (isVSCode && binary) {
    // Use VS Code serve-web on Windows (code-server has no Windows build)
    codeServerProc = spawn(`"${binary}"`, [
      'serve-web',
      '--port', '0',
      '--host', '127.0.0.1',
      '--without-connection-token',
      '--disable-telemetry',
      '--default-folder', workspaceRoot,
    ], {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
    });
    console.log('[code-server] using VS Code serve-web');
  } else if (binary) {
    // Cursor fallback: try serve-web (may not support it)
    codeServerProc = spawn(`"${binary}"`, [
      'serve-web',
      '--port', '0',
      '--host', '127.0.0.1',
      '--without-connection-token',
      '--disable-telemetry',
      '--default-folder', workspaceRoot,
    ], {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
    });
    console.log('[code-server] using Cursor serve-web fallback');
  } else {
    // Linux/macOS: use code-server binary
    codeServerProc = spawn('code-server', [
      '--port', '0',
      '--auth', 'none',
      '--disable-telemetry',
      workspaceRoot,
    ], {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
    });
    console.log('[code-server] using code-server binary');
  }

  codeServerProc.stdout?.on('data', (data: Buffer) => {
    const output = data.toString();
    const match = output.match(/http:\/\/localhost:(\d+)/);
    if (match && !codeServerPort) {
      codeServerPort = parseInt(match[1], 10);
      console.log('[code-server] started on port', codeServerPort);
      if (codeServerView) {
        codeServerView.webContents.loadURL(`http://localhost:${codeServerPort}`);
      }
    }
  });

  codeServerProc.stderr?.on('data', (data: Buffer) => {
    // code-server / serve-web logs info to stderr
    const output = data.toString();
    const match = output.match(/http:\/\/localhost:(\d+)/);
    if (match && !codeServerPort) {
      codeServerPort = parseInt(match[1], 10);
      console.log('[code-server] started on port', codeServerPort);
      if (codeServerView) {
        codeServerView.webContents.loadURL(`http://localhost:${codeServerPort}`);
      }
    }
  });

  codeServerProc.on('exit', (code) => {
    console.log('[code-server] exited with code', code);
    codeServerProc = null;
    codeServerPort = null;
  });

  // Fallback: try common ports after timeout
  setTimeout(() => {
    if (!codeServerPort && codeServerView) {
      codeServerPort = 8080;
      codeServerView.webContents.loadURL('http://localhost:8080');
    }
  }, 5000);
}

export function setCodeServerBounds(x: number, y: number, width: number, height: number) {
  if (codeServerView && width > 0 && height > 0) {
    codeServerView.setBounds({ x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) });
  }
}

export function hideCodeServerView() {
  if (codeServerView) {
    codeServerView.setBounds({ x: 0, y: 0, width: 0, height: 0 });
  }
}

export function destroyCodeServerView() {
  if (codeServerProc) {
    codeServerProc.kill();
    codeServerProc = null;
  }
  if (codeServerView && parentWindow) {
    parentWindow.contentView.removeChildView(codeServerView);
    codeServerView = null;
  }
  codeServerPort = null;
}
