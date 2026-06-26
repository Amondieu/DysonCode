import { WebContentsView, BrowserWindow, ipcMain, shell, session } from 'electron';
import path from 'path';
import fs from 'fs';

// ── AdBlock filter (basic tracker/ad domain patterns) ──
const AD_PATTERNS: RegExp[] = [
  /doubleclick\.net/,
  /googlesyndication\.com/,
  /googleadservices\.com/,
  /googleads\.g\.doubleclick\.net/,
  /adservice\.google\./,
  /pagead\d*\.googlesyndication/,
  /adnxs\.com/,
  /adsrvr\.org/,
  /adzerk\.net/,
  /scorecardresearch\.com/,
  /outbrain\.com/,
  /taboola\.com/,
  /criteo\.com/,
  /casalemedia\.com/,
  /rubiconproject\.com/,
  /amazon-adsystem\.com/,
  /adsafeprotected\.com/,
  /moatads\.com/,
  /2o7\.net/,
  /serving-sys\.com/,
  /ads\./,
  /adtrack/,
  /analytics\./,
  /\.track\./,
  /clarity\.ms/,
  /bat\.bing\.com/,
  /collector\./,
];

type PanelId = 'browser' | 'monaco' | 'stream' | 'codeserver';
type TabId = 'chat' | 'flow' | 'canvas' | 'mesh';

interface PanelState {
  activeTab: TabId;
  activeCenterPanel: PanelId | null;
  bounds: Electron.Rectangle | null;
  sidebarBounds: Electron.Rectangle | null;
  sidebarVisible: boolean;
  rightPanelBounds: Electron.Rectangle | null;
  rightPanelVisible: boolean;
  adblockOn: boolean;
  adblockCount: number;
}

const state: PanelState = {
  activeTab: 'chat',
  activeCenterPanel: null,
  bounds: null,
  sidebarBounds: null,
  sidebarVisible: false,
  rightPanelBounds: null,
  rightPanelVisible: false,
  adblockOn: true,
  adblockCount: 0,
};

const views: Record<string, WebContentsView> = {};
const OFFSCREEN = { x: -10000, y: -10000, width: 1, height: 1 };
let win: BrowserWindow | null = null;

// ── Asset path resolution ──
function assetPath(filename: string): string {
  const candidates = [
    path.join(__dirname, '..', '..', 'assets', filename),
    path.join(process.resourcesPath || '', 'assets', filename),
    path.join(__dirname, 'assets', filename),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return candidates[0];
}

// ── Init: create all views once at startup ──
export function initPanelManager(browserWindow: BrowserWindow) {
  win = browserWindow;

  // Browser panel — shared between center and sidebar
  // Note: sandbox is OFF so real web pages can load JS/css/images
  views.browser = new WebContentsView({
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: false },
  });
  views.browser.webContents.loadURL('about:blank');

  // Monaco editor panel
  views.monaco = new WebContentsView({
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  const monacoHtml = assetPath('monaco.html');
  if (fs.existsSync(monacoHtml)) {
    views.monaco.webContents.loadFile(monacoHtml);
  } else {
    views.monaco.webContents.loadURL('about:blank');
    console.warn('[panel-manager] monaco.html not found at', monacoHtml);
  }

  // Stream panel
  views.stream = new WebContentsView({
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  const streamHtml = assetPath('stream.html');
  if (fs.existsSync(streamHtml)) {
    views.stream.webContents.loadFile(streamHtml);
  } else {
    views.stream.webContents.loadURL('about:blank');
    console.warn('[panel-manager] stream.html not found at', streamHtml);
  }

  // Code-server panel (WebContentsView, content loaded when code-server starts)
  views.codeserver = new WebContentsView({
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  views.codeserver.webContents.loadURL('about:blank');

  // Right-panel browser — independent WebContentsView
  views['right-browser'] = new WebContentsView({
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: false },
  });
  views['right-browser'].webContents.loadURL('about:blank');

  // Add all views to window (order: stream bottom, codeserver, monaco, right-browser, browser top)
  win.contentView.addChildView(views.stream);
  win.contentView.addChildView(views.codeserver);
  win.contentView.addChildView(views.monaco);
  win.contentView.addChildView(views['right-browser']);
  win.contentView.addChildView(views.browser);

  // Move all off-screen initially
  Object.values(views).forEach((v) => v.setBounds(OFFSCREEN));

  // Browser URL sync to renderer
  views.browser.webContents.on('did-navigate', (_event, url) => {
    win?.webContents.send('panels:browserUrlChanged', url);
  });
  views.browser.webContents.on('did-navigate-in-page', (_event, url) => {
    win?.webContents.send('panels:browserUrlChanged', url);
  });
  views.browser.webContents.on('page-title-updated', (_event, title) => {
    win?.webContents.send('panels:browserTitleUpdated', title);
  });

  // Browser navigation failure → retry or show error-friendly page
  views.browser.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    if (validatedURL !== 'about:blank') {
      console.warn(`[panel-manager] Browser navigation failed: ${errorDescription} (${errorCode}) for ${validatedURL}`);
    }
  });

  // Browser crash recovery
  views.browser.webContents.on('render-process-gone', (_event, details) => {
    console.warn('[panel-manager] Browser render process gone:', details.reason);
    if (views.browser) {
      views.browser.webContents.loadURL('about:blank');
    }
  });
  views['right-browser'].webContents.on('render-process-gone', (_event, details) => {
    console.warn('[panel-manager] Right-browser render process gone:', details.reason);
    if (views['right-browser']) {
      views['right-browser'].webContents.loadURL('about:blank');
    }
  });

  registerIPC();
  setupAdBlock();
  console.log('[panel-manager] Initialized — 5 panels ready (incl. right-browser)');
}

// ── Visibility gate: sidebar browser OR center panel, never both ──
function updateVisibility() {
  const { activeTab, activeCenterPanel, bounds, sidebarBounds, sidebarVisible, rightPanelBounds, rightPanelVisible } = state;

  // Center host is only visible in CHAT tab
  const centerIsVisible = activeTab === 'chat';

  Object.entries(views).forEach(([id, view]) => {
    if (id === 'browser') {
      // Browser: prefer sidebar if visible, otherwise center panel
      if (sidebarVisible && sidebarBounds && sidebarBounds.width > 10 && sidebarBounds.height > 10) {
        console.log(`[panel-manager] view ${id} → sidebar bounds`, sidebarBounds);
        view.setBounds({
          x: Math.round(sidebarBounds.x),
          y: Math.round(sidebarBounds.y),
          width: Math.round(sidebarBounds.width),
          height: Math.round(sidebarBounds.height),
        });
      } else if (
        centerIsVisible &&
        activeCenterPanel === 'browser' &&
        bounds !== null &&
        bounds.width > 10 &&
        bounds.height > 10
      ) {
        console.log(`[panel-manager] view ${id} → center bounds`, bounds);
        view.setBounds({
          x: Math.round(bounds.x),
          y: Math.round(bounds.y),
          width: Math.round(bounds.width),
          height: Math.round(bounds.height),
        });
      } else {
        console.log(`[panel-manager] view ${id} → OFFSCREEN (sidebar=${sidebarVisible}, center=${centerIsVisible && activeCenterPanel === 'browser'}, bounds=${JSON.stringify(bounds)})`);
        view.setBounds(OFFSCREEN);
      }
    } else if (id === 'right-browser') {
      // Right-panel browser: follows right panel bounds
      if (rightPanelVisible && rightPanelBounds && rightPanelBounds.width > 10 && rightPanelBounds.height > 10) {
        view.setBounds({
          x: Math.round(rightPanelBounds.x),
          y: Math.round(rightPanelBounds.y),
          width: Math.round(rightPanelBounds.width),
          height: Math.round(rightPanelBounds.height),
        });
      } else {
        view.setBounds(OFFSCREEN);
      }
    } else {
      // Other panels: center-only
      const shouldShow =
        centerIsVisible &&
        activeCenterPanel === id &&
        bounds !== null &&
        bounds.width > 10 &&
        bounds.height > 10;

      if (shouldShow && bounds) {
        view.setBounds({
          x: Math.round(bounds.x),
          y: Math.round(bounds.y),
          width: Math.round(bounds.width),
          height: Math.round(bounds.height),
        });
      } else {
        view.setBounds(OFFSCREEN);
      }
    }
  });
}

// ── IPC Registration ──
function registerIPC() {
  // Tab / panel / bounds state from renderer
  ipcMain.handle('panels:setActiveTab', (_e, tab: TabId) => {
    console.log(`[panel-manager] setActiveTab: ${tab}`);
    state.activeTab = tab;
    updateVisibility();
  });

  ipcMain.handle('panels:setActivePanel', (_e, panel: PanelId | null) => {
    console.log(`[panel-manager] setActivePanel: ${panel}`);
    state.activeCenterPanel = panel;
    updateVisibility();
  });

  ipcMain.handle('panels:setBounds', (_e, bounds: Electron.Rectangle) => {
    console.log(`[panel-manager] setBounds: ${JSON.stringify(bounds)}`);
    state.bounds = bounds;
    updateVisibility();
  });

  // ── Sidebar browser IPC ──
  ipcMain.on('sidebar:browser-bounds', (_e, bounds: Electron.Rectangle) => {
    state.sidebarBounds = bounds;
    updateVisibility();
  });

  // Listen for both 'sidebar:panel-visible' (via send) and 'panels:setRightPanelBounds' (via invoke)
  ipcMain.on('sidebar:panel-visible', (_e, { panel, visible }: { panel: string; visible: boolean }) => {
    if (panel === 'browser') {
      state.sidebarVisible = visible;
      if (!visible) {
        state.sidebarBounds = null;
      }
      updateVisibility();
    } else if (panel === 'right-browser') {
      state.rightPanelVisible = visible;
      if (!visible) {
        state.rightPanelBounds = null;
      }
      updateVisibility();
    }
  });

  // ── Right panel browser IPC ──
  ipcMain.handle('panels:setRightPanelBounds', (_e, bounds: Electron.Rectangle) => {
    state.rightPanelBounds = bounds;
    updateVisibility();
  });

  ipcMain.handle('panels:rightBrowserNavigate', (_e, url: string) => {
    if (views['right-browser']) {
      const finalUrl = url.startsWith('http') ? url : `https://${url}`;
      views['right-browser'].webContents.loadURL(finalUrl);
    }
  });

  ipcMain.handle('panels:rightBrowserGoBack', () => {
    if (views['right-browser']?.webContents.canGoBack()) {
      views['right-browser'].webContents.goBack();
    }
  });

  ipcMain.handle('panels:rightBrowserGoForward', () => {
    if (views['right-browser']?.webContents.canGoForward()) {
      views['right-browser'].webContents.goForward();
    }
  });

  ipcMain.handle('panels:rightBrowserReload', () => {
    views['right-browser']?.webContents.reload();
  });

  ipcMain.handle('panels:rightBrowserSetZoom', (_e, factor: number) => {
    if (views['right-browser'] && factor > 0) {
      views['right-browser'].webContents.setZoomFactor(factor);
    }
  });

  // ── Browser navigation ──
  ipcMain.handle('panels:browserNavigate', (_e, url: string) => {
    if (views.browser) {
      const finalUrl = url.startsWith('http') ? url : `https://${url}`;
      views.browser.webContents.loadURL(finalUrl);
    }
  });

  ipcMain.handle('panels:browserGoBack', () => {
    if (views.browser?.webContents.canGoBack()) {
      views.browser.webContents.goBack();
    }
  });

  ipcMain.handle('panels:browserGoForward', () => {
    if (views.browser?.webContents.canGoForward()) {
      views.browser.webContents.goForward();
    }
  });

  ipcMain.handle('panels:browserReload', () => {
    views.browser?.webContents.reload();
  });

  ipcMain.handle('panels:browserSetZoom', (_e, factor: number) => {
    if (views.browser && factor > 0) {
      views.browser.webContents.setZoomFactor(factor);
    }
  });

  ipcMain.handle('panels:browserGetZoom', () => {
    return views.browser?.webContents.getZoomFactor() ?? 1.0;
  });

  // ── Monaco file operations ──
  ipcMain.handle('panels:monacoOpen', (_e, filePath: string) => {
    if (!views.monaco) return;
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      views.monaco.webContents.executeJavaScript(`
        window.postMessage({ type: 'open', path: '${filePath.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}', content: ${JSON.stringify(content)} }, '*');
      `);
    } catch (err) {
      console.warn('[panel-manager] Cannot open file:', filePath, (err as Error).message);
      views.monaco.webContents.executeJavaScript(`
        window.postMessage({ type: 'open', path: '${filePath.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}', content: '(file not readable)' }, '*');
      `);
    }
  });

  ipcMain.handle('panels:monacoSave', (_e, filePath: string, content: string) => {
    try {
      fs.writeFileSync(filePath, content, 'utf-8');
      return true;
    } catch (err) {
      console.warn('[panel-manager] Save failed:', filePath, (err as Error).message);
      return false;
    }
  });

  // ── Stream events ──
  ipcMain.handle('panels:streamSnapshot', (_e, snapshot: Record<string, unknown>) => {
    if (!views.stream) return;
    views.stream.webContents.executeJavaScript(`
      window.postMessage({ type: 'snapshot', state: ${JSON.stringify(snapshot)}, timestamp: '${new Date().toISOString()}' }, '*');
    `).catch(() => {});
  });

  ipcMain.handle('panels:streamEvent', (_e, event: Record<string, unknown>) => {
    if (!views.stream) return;
    views.stream.webContents.executeJavaScript(`
      window.postMessage({ type: 'event', event: ${JSON.stringify(event)}, timestamp: '${new Date().toISOString()}' }, '*');
    `).catch(() => {});
  });

  ipcMain.handle('panels:streamClear', () => {
    if (!views.stream) return;
    views.stream.webContents.executeJavaScript(`
      window.postMessage({ type: 'clear' }, '*');
    `).catch(() => {});
  });

  // ── Code-server ──
  ipcMain.handle('panels:codeserverSetUrl', (_e, url: string) => {
    if (views.codeserver) {
      views.codeserver.webContents.loadURL(url);
    }
  });

  // ── Perplexity Search ──
  // Sends a query to Perplexity: tries the sidebar browser view first,
  // then falls back to opening the default system browser.
  ipcMain.handle('perplexity:search', async (_e, query: string) => {
    const perplexUrl = `https://www.perplexity.ai/search?q=${encodeURIComponent(query)}`;
    try {
      // Try sidebar browser if visible
      if (views.browser && state.sidebarVisible && state.sidebarBounds) {
        views.browser.webContents.loadURL(perplexUrl);
        return { ok: true, method: 'sidebar' };
      }
      // Fallback: open in system default browser
      await shell.openExternal(perplexUrl);
      return { ok: true, method: 'external' };
    } catch (err) {
      // Final fallback: try external browser anyway
      try {
        await shell.openExternal(perplexUrl);
        return { ok: true, method: 'external' };
      } catch {
        return { ok: false, error: (err as Error).message };
      }
    }
  });

  // ── Debug: dump all view states ──
  ipcMain.handle('panels:debugViews', () => {
    const info: Record<string, unknown> = {};
    Object.entries(views).forEach(([id, view]) => {
      info[id] = {
        bounds: view.getBounds(),
        url: view.webContents.getURL(),
        title: view.webContents.getTitle(),
      };
    });
    return {
      state: {
        activeTab: state.activeTab,
        activeCenterPanel: state.activeCenterPanel,
        bounds: state.bounds,
        sidebarBounds: state.sidebarBounds,
        sidebarVisible: state.sidebarVisible,
        rightPanelBounds: state.rightPanelBounds,
        rightPanelVisible: state.rightPanelVisible,
        centerIsVisible: state.activeTab === 'chat',
      },
      views: info,
    };
  });

  // ── AdBlock IPC handlers ──
  ipcMain.handle('panels:getAdBlockState', () => {
    return { enabled: state.adblockOn, blocked: state.adblockCount };
  });

  ipcMain.handle('panels:toggleAdBlock', () => {
    state.adblockOn = !state.adblockOn;
    return { enabled: state.adblockOn };
  });
}

// ── AdBlock setup ──
function setupAdBlock() {
  const filter = {
    urls: ['*://*/*'],
  };

  // Intercept requests on both browser views
  [views.browser, views['right-browser']].forEach((v) => {
    if (!v) return;
    v.webContents.session.webRequest.onBeforeRequest(filter, (details, callback) => {
      if (state.adblockOn) {
        try {
          const url = details.url.toLowerCase();
          const isBlocked = AD_PATTERNS.some((pattern) => pattern.test(url));
          if (isBlocked) {
            state.adblockCount++;
            callback({ cancel: true });
            return;
          }
        } catch {
          // ignore regex errors
        }
      }
      callback({ cancel: false });
    });
  });
}

// ── Public accessors for stream events from mission-control-manager ──
export function getStreamView(): WebContentsView | null {
  return views.stream || null;
}

export function getBrowserView(): WebContentsView | null {
  return views.browser || null;
}

export function getMonacoView(): WebContentsView | null {
  return views.monaco || null;
}

export function getCodeServerView(): WebContentsView | null {
  return views.codeserver || null;
}
