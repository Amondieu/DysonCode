// browser-panel.ts — DEPRECATED
// All browser WebContentsView functionality has been consolidated into panel-manager.ts
// This file is kept as a stub to prevent import errors. Remove after verifying no imports remain.
import { BrowserWindow } from 'electron';

export function createBrowserPanel(_win: BrowserWindow) {
  // no-op — use panel-manager.ts initPanelManager()
}

export function updateBrowserBounds(_bounds: { x: number; y: number; width: number; height: number }) {
  // no-op — use panel-manager.ts sidebar browser IPC
}

export function showBrowserView() {
  // no-op
}

export function hideBrowserView() {
  // no-op
}
