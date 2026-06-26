# DysonCode — Embedded Browser Panel: Full Integration Guide

A production-ready, multi-tab browser embedded inside the DysonCode left sidebar panel,
powered by Electron `WebContentsView` (v30+), `@cliqz/adblocker-electron` (Brave/uBlock filter engine),
and a custom dark-mode renderer UI.

---

## Architecture Overview

```
DysonCode BrowserWindow
 ├─ contentView (BaseWindow root)
 │   ├─ UI WebContentsView (tabs + toolbar HTML — the renderer)
 │   └─ Tab WebContentsView × N  (the actual browsed pages)
 └─ Main Process
     ├─ browser-main.ts     ← all tab management + IPC handlers
     ├─ browser-preload.ts  ← cosmetic filter bridge for adblocker
     └─ @cliqz/adblocker-electron ← EasyList + uBlock filter engine
```

The renderer UI **never** uses `<webview>` tags (deprecated, unstable).
Each browser tab is a **separate** `WebContentsView` with its own Chromium renderer process,
isolated in a persistent named session (`persist:dyson-browser`).

---

## 1 — Install Dependencies

```bash
npm install @cliqz/adblocker-electron @cliqz/adblocker-electron-preload cross-fetch
```

`@cliqz/adblocker-electron` is the Ghostery/Brave-derived engine — actively maintained
(last published < 24 h ago as of June 2026), supports full EasyList + uBlock Origin filter format,
cosmetic (CSS-hide) rules, and scriptlet injection.

---

## 2 — File Structure

Add these files to your existing Tauri/Electron project:

```
src-electron/
 ├─ browser-main.ts        ← copy from artifact (main process module)
 ├─ browser-preload.ts     ← copy from artifact (preload for adblocker cosmetics)
 └─ browser-panel.html     ← copy from artifact (tab bar + toolbar renderer)
```

### Wire into your existing `main.ts`

```typescript
import { createBrowserPanel, updateBrowserBounds, initAdBlocker } from './browser-main';

app.whenReady().then(async () => {
  const mainWin = new BrowserWindow({ /* your existing config */ });
  mainWin.loadFile('index.html');

  // Initialise browser panel — attaches to your existing window
  createBrowserPanel(mainWin);

  // When your sidebar resizes, call this to reposition the browser view:
  ipcMain.on('sidebar:browser-bounds', (_, bounds) => {
    updateBrowserBounds(bounds);
  });
});
```

### Expose IPC in your existing contextBridge preload

```typescript
// preload.ts (your existing one — add these channels)
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  send: (channel: string, data?: unknown) => ipcRenderer.send(channel, data),
  on: (channel: string, callback: (...args: any[]) => void) => {
    ipcRenderer.on(channel, (_event, ...args) => callback(...args));
  },
});
```

---

## 3 — Embed the Browser Panel in your Sidebar HTML

In your existing sidebar/left-panel HTML, replace the external-link button with:

```html
<!-- Sidebar left panel -->
<div id="browserContainer" style="height: 100%; display: flex; flex-direction: column;">
  <!-- The WebContentsView is positioned OVER this div by the main process.
       This iframe acts as the tab bar + toolbar UI. -->
  <webview
    id="browserUI"
    src="./browser-panel.html"
    nodeintegration="false"
    style="width:100%; height:100%; border:none;"
  ></webview>
</div>
```

**Better approach (recommended):** load `browser-panel.html` as a second `WebContentsView`
for the chrome (tab bar + toolbar), then position the page views below it — same as VS Code,
Arc, or Wexond Browser do internally.

```typescript
// In browser-main.ts — createBrowserPanel()
const chromeView = new WebContentsView({ webPreferences: { preload: CHROME_PRELOAD } });
win.contentView.addChildView(chromeView);
chromeView.webContents.loadFile('browser-panel.html');
chromeView.setBounds({ x: sidebarX, y: 0, width: sidebarW, height: 72 }); // toolbar height

// Tab page views start at y: 72
browserViewBounds = { x: sidebarX, y: 72, width: sidebarW, height: winH - 72 - statusH };
```

---

## 4 — AdBlocker Configuration

`initAdBlocker()` (called automatically from `createBrowserPanel`) downloads and caches:

| Filter List | Blocks |
|---|---|
| EasyList | Ads (banners, popups, overlays) |
| EasyPrivacy | Tracking pixels, analytics |
| uAssets filters | uBlock Origin rules (cosmetic + network) |
| uAssets badware | Malware/phishing domains |

The cache is written to disk on first run (~2 MB). On subsequent launches it loads from cache
in < 50 ms. Filter lists auto-update in the background.

### Customise filter lists

```typescript
// In initAdBlocker() — replace fromPrebuiltAdsAndTracking with:
blocker = await ElectronBlocker.fromLists(fetch, [
  'https://easylist.to/easylist/easylist.txt',
  'https://easylist.to/easylist/easyprivacy.txt',
  'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters.txt',
  'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/annoyances.txt',
  // German-specific:
  'https://easylist.to/easylistgermany/easylistgermany.txt',
]);
```

### Toggle per-tab (optional)

```typescript
// Disable adblock for a specific tab's session only
const tabSession = tab.view.webContents.session;
blocker.disableBlockingInSession(tabSession);
```

---

## 5 — Zoom Implementation

Zoom uses Electron's native `webContents.setZoomFactor()` — proper CSS zoom, not a viewport hack.

| Shortcut | Action |
|---|---|
| `Ctrl + =` | Zoom in (+10%) |
| `Ctrl + -` | Zoom out (−10%) |
| `Ctrl + 0` | Reset to 100% |
| Toolbar 🔍 | Open zoom overlay widget |
| Click `%` badge | Open zoom overlay widget |

Zoom range: **30% → 300%** (clamped). The zoom badge in the URL bar appears only when zoom ≠ 100%.
Zoom is per-tab — switching tabs restores that tab's zoom level via `getZoomFactor()` on switch.

```typescript
// Add to switchToTab():
const factor = tab.view.webContents.getZoomFactor();
sendToRenderer('browser:zoom-changed', { factor, percent: Math.round(factor * 100) });
```

---

## 6 — Keyboard Shortcuts Reference

| Shortcut | Action |
|---|---|
| `Ctrl+T` | New tab |
| `Ctrl+W` | Close active tab |
| `Ctrl+L` | Focus URL bar |
| `Ctrl+=` | Zoom in |
| `Ctrl+-` | Zoom out |
| `Ctrl+0` | Zoom reset |
| `F5` | Reload |
| `Alt+←` | Go back |
| `Alt+→` | Go forward |
| `Escape` | Close zoom overlay / blur URL bar |

---

## 7 — Security Hardening

Each tab `WebContentsView` uses:

```typescript
webPreferences: {
  nodeIntegration: false,       // No Node.js in tab pages
  contextIsolation: true,       // Isolated JS context
  sandbox: true,                // Chromium process sandbox
  webSecurity: true,            // Same-origin policy enforced
  session: session.fromPartition(BROWSER_SESSION),  // Isolated from app session
}
```

Additionally, block dangerous navigation in the main process:

```typescript
view.webContents.on('will-navigate', (event, url) => {
  // Block file:// and custom protocol abuse
  if (url.startsWith('file://') || url.startsWith('javascript:')) {
    event.preventDefault();
  }
});

// Handle certificate errors (optional: show inline warning)
view.webContents.on('certificate-error', (event, url, error, cert, callback) => {
  event.preventDefault();
  callback(false); // reject invalid certs — show error page instead
});
```

---

## 8 — Sidebar Bounds Sync

When the user resizes the sidebar, send updated bounds from the renderer:

```javascript
// In your sidebar resize handler (renderer JS)
const resizeObserver = new ResizeObserver(entries => {
  const { x, y, width, height } = browserContainer.getBoundingClientRect();
  window.electronAPI.send('sidebar:browser-bounds', {
    x: Math.round(x), y: Math.round(y + 72), // below toolbar
    width: Math.round(width), height: Math.round(height - 72)
  });
});
resizeObserver.observe(document.getElementById('browserContainer'));
```

---

## 9 — Why NOT `<webview>` tag

The Electron docs explicitly warn against `<webview>`:

> *"WebViews are based on Chromium's WebViews and are not explicitly supported by Electron.
> We cannot guarantee that the WebView API will remain available in future versions."*

`WebContentsView` (since Electron 28, stable in Electron 30) is the correct replacement,
offering a full Chromium renderer per tab with a clean child-view layout hierarchy.
`BrowserView` was deprecated in Electron 30 and should not be used in new code.

---

## 10 — Package & Dependencies Reference

```json
{
  "dependencies": {
    "@cliqz/adblocker-electron": "^1.33.2",
    "@cliqz/adblocker-electron-preload": "^1.33.2",
    "cross-fetch": "^4.0.0",
    "electron": "^30.0.0"
  }
}
```

`@cliqz/adblocker-electron` v1.33.2 was published within the last 24 hours (June 2026) —
this is the same engine powering Ghostery and partially Brave Browser's filter matching.

---

## Quick Checklist

- [ ] `npm install @cliqz/adblocker-electron @cliqz/adblocker-electron-preload cross-fetch`
- [ ] Add `browser-main.ts`, `browser-preload.ts`, `browser-panel.html` to project
- [ ] Call `createBrowserPanel(mainWin)` from `app.whenReady()`
- [ ] Expose IPC channels in contextBridge preload
- [ ] Call `updateBrowserBounds(bounds)` on sidebar resize
- [ ] Set Electron ≥ 30 in `package.json`
- [ ] Test adblock toggle (🛡 button)
- [ ] Test Ctrl+T, Ctrl+W, Ctrl+L keyboard shortcuts
- [ ] Verify zoom range 30%–300% per tab
