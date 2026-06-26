import { WebContentsView, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import fs from 'fs';

let monacoView: WebContentsView | null = null;
let parentWindow: BrowserWindow | null = null;

export function createMonacoView(win: BrowserWindow): WebContentsView {
  if (monacoView) return monacoView;

  parentWindow = win;
  monacoView = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.contentView.addChildView(monacoView);

  // Listen for save messages from Monaco's postMessage
  monacoView.webContents.on('ipc-message-sync', (_event, channel, ...args) => {
    // Handled via preload bridge
  });

  // Load the local monaco.html
  const htmlPath = path.join(__dirname, '..', '..', 'assets', 'monaco.html');
  if (fs.existsSync(htmlPath)) {
    monacoView.webContents.loadFile(htmlPath);
  } else {
    // Fallback: inline HTML
    monacoView.webContents.loadURL('about:blank');
    console.warn('[monaco-panel] assets/monaco.html not found at', htmlPath);
  }

  return monacoView;
}

export function openFileInMonaco(filePath: string) {
  if (!monacoView) return;
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    monacoView.webContents.executeJavaScript(`
      window.postMessage({ type: 'open', path: '${filePath.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}', content: ${JSON.stringify(content)} }, '*');
    `);
  } catch (err) {
    console.warn('[monaco-panel] Cannot open file:', filePath, (err as Error).message);
    monacoView.webContents.executeJavaScript(`
      window.postMessage({ type: 'open', path: '${filePath.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}', content: '(file not readable)' }, '*');
    `);
  }
}

export function saveMonacoFile(filePath: string, content: string) {
  try {
    fs.writeFileSync(filePath, content, 'utf-8');
    return true;
  } catch (err) {
    console.warn('[monaco-panel] Save failed:', filePath, (err as Error).message);
    return false;
  }
}

export function setMonacoBounds(x: number, y: number, width: number, height: number) {
  if (monacoView && width > 0 && height > 0) {
    monacoView.setBounds({ x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) });
  }
}

export function hideMonacoView() {
  if (monacoView) {
    monacoView.setBounds({ x: 0, y: 0, width: 0, height: 0 });
  }
}

export function destroyMonacoView() {
  if (monacoView && parentWindow) {
    parentWindow.contentView.removeChildView(monacoView);
    monacoView = null;
  }
}
