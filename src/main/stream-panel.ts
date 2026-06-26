import { WebContentsView, BrowserWindow } from 'electron';
import path from 'path';
import fs from 'fs';

let streamView: WebContentsView | null = null;
let parentWindow: BrowserWindow | null = null;

export function createStreamView(win: BrowserWindow): WebContentsView {
  if (streamView) return streamView;

  parentWindow = win;
  streamView = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.contentView.addChildView(streamView);

  const htmlPath = path.join(__dirname, '..', '..', 'assets', 'stream.html');
  if (fs.existsSync(htmlPath)) {
    streamView.webContents.loadFile(htmlPath);
  } else {
    streamView.webContents.loadURL('about:blank');
    console.warn('[stream-panel] assets/stream.html not found at', htmlPath);
  }

  return streamView;
}

export function sendStreamSnapshot(snapshot: Record<string, unknown>) {
  if (!streamView) return;
  streamView.webContents.executeJavaScript(`
    window.postMessage({ type: 'snapshot', state: ${JSON.stringify(snapshot)}, timestamp: '${new Date().toISOString()}' }, '*');
  `).catch(() => {});
}

export function sendStreamEvent(event: Record<string, unknown>) {
  if (!streamView) return;
  streamView.webContents.executeJavaScript(`
    window.postMessage({ type: 'event', event: ${JSON.stringify(event)}, timestamp: '${new Date().toISOString()}' }, '*');
  `).catch(() => {});
}

export function setStreamBounds(x: number, y: number, width: number, height: number) {
  if (streamView && width > 0 && height > 0) {
    streamView.setBounds({ x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) });
  }
}

export function hideStreamView() {
  if (streamView) {
    streamView.setBounds({ x: 0, y: 0, width: 0, height: 0 });
  }
}

export function destroyStreamView() {
  if (streamView && parentWindow) {
    parentWindow.contentView.removeChildView(streamView);
    streamView = null;
  }
}
