// DysonCode — Electron main process
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Safe require electron
let electron;
try {
  electron = require('electron');
} catch(e) {
  console.error('FATAL: Cannot load electron API:', e.message);
  process.exit(1);
}

const { app, BrowserWindow } = electron;

const { registerIpcHandlers } = require('./ipc-handlers');
const { terminalManager } = require('./terminal-manager');
const { missionControlManager } = require('./mission-control-manager');
const { setDbPath, closeDb } = require('./db');
// browser-panel is DEPRECATED - panel-manager handles all WebContentsView lifecycle

// Track spawned backend processes for cleanup
const backendProcesses = [];

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const content = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function loadLocalEnv() {
  const candidates = [
    path.resolve(process.cwd(), '.env.local'),
    path.resolve(process.cwd(), '.env'),
    path.resolve(__dirname, '../../.env.local'),
    path.resolve(__dirname, '../../.env'),
    path.resolve(path.dirname(process.execPath), '.env.local'),
    path.resolve(path.dirname(process.execPath), '.env'),
    path.resolve(path.dirname(process.execPath), 'resources', '.env'),
  ];

  for (const candidate of candidates) {
    loadEnvFile(candidate);
  }
}

loadLocalEnv();

// ── Backend auto-start ──────────────────────────────────────────────
function startBackends() {
  const mode = process.env.KORE_ROUTING_MODE || 'hybrid';
  console.log(`[dyson] routing mode: ${mode}`);

  // Try starting litellm proxy for cloud/hybrid modes
  if (mode === 'cloud' || mode === 'hybrid') {
    startLiteLLM();
  }
}

function findLiteLLMConfig() {
  const candidates = [
    process.env.LITELLM_CONFIG_PATH,
    path.resolve(process.env.HOME || process.env.USERPROFILE || '.', '.litellm', 'config.yaml'),
    path.resolve(__dirname, '../../.litellm', 'config.yaml'),
    path.resolve(__dirname, '../../tmp/litellm-master.yaml'),
  ];
  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c;
  }
  return null;
}

function startLiteLLM() {
  // First check if litellm is already running on port 4000
  const http = require('http');
  const checkAlive = (cb) => {
    const req = http.get('http://127.0.0.1:4000/health', (res) => {
      cb(res.statusCode === 200);
    });
    req.on('error', () => cb(false));
    req.setTimeout(2000, () => { req.destroy(); cb(false); });
  };

  checkAlive((alive) => {
    if (alive) {
      console.log('[dyson] litellm already running on :4000');
      return;
    }

    const configPath = findLiteLLMConfig();
    const args = ['--port', process.env.LITELLM_PORT || '4000', '--host', '127.0.0.1'];
    if (configPath) { args.push('--config', configPath); }

    try {
      // PYTHONIOENCODING=utf-8 fixes Windows charmap banner issue
      const proc = spawn('litellm', args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
        detached: false,
      });
      proc.stdout.on('data', (d) => console.log(`[litellm] ${d.toString().trim()}`));
      proc.stderr.on('data', (d) => console.warn(`[litellm:err] ${d.toString().trim()}`));
      proc.on('error', (err) => console.warn('[litellm] failed to start:', err.message));
      proc.on('exit', (code) => console.log(`[litellm] exited (${code})`));
      backendProcesses.push(proc);
      console.log('[dyson] litellm proxy starting on port', process.env.LITELLM_PORT || '4000');
    } catch (err) {
      console.warn('[dyson] litellm spawn failed:', err.message);
    }
  });
}

function stopBackends() {
  for (const proc of backendProcesses) {
    try { proc.kill(); } catch (_) { /* already dead */ }
  }
  backendProcesses.length = 0;
}

try {
  setDbPath(path.join(app.getPath('userData'), 'dysoncode.db'));
} catch(e) {
  console.error('DB path error:', e.message);
  process.exit(1);
}

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'DysonCode',
    backgroundColor: '#0d1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

app.whenReady().then(async function () {
  registerIpcHandlers();
  startBackends();
  createWindow();

  // Init unified PanelManager — all WebContentsViews created and hidden at once
  if (mainWindow) {
    const { initPanelManager } = require('./panel-manager');
    initPanelManager(mainWindow);
  }

  try {
    terminalManager.create('Shell');
  } catch(e) {
    console.warn('Terminal unavailable:', e.message);
  }

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', function () {
  stopBackends();
  // PanelManager views are destroyed when BrowserWindow closes
  missionControlManager.stop();
  terminalManager.killAll();
  closeDb();
});
