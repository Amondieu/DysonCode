import { useEffect, useRef } from 'react';

type PanelId = 'browser' | 'monaco' | 'stream' | 'codeserver';
type TabId = 'chat' | 'flow' | 'canvas' | 'mesh';

/**
 * Shared hook for every center panel component.
 * Manages the unified PanelManager in the main process:
 * - Tells main process which tab is active
 * - Tells main process which center panel is selected
 * - Sends container bounds via ResizeObserver
 *
 * Always attach to the host div that defines the native view's coordinate space.
 */
export function usePanelManager(
  panelId: PanelId,
  activeMainTab: TabId,
  activeCenterPanel: PanelId | null,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const ipc = (window as any).dyson;

  // Sync active tab to main process
  useEffect(() => {
    ipc?.panelsSetActiveTab?.(activeMainTab);
  }, [activeMainTab, ipc]);

  // Sync active center panel to main process
  useEffect(() => {
    ipc?.panelsSetActivePanel?.(activeCenterPanel);
  }, [activeCenterPanel, ipc]);

  // Sync container bounds with ResizeObserver
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !ipc) return;

    const sync = () => {
      const r = el.getBoundingClientRect();
      if (r.width < 10 || r.height < 10) return; // ignore collapsed
      ipc.panelsSetBounds?.({
        x: Math.round(r.left),
        y: Math.round(r.top),
        width: Math.round(r.width),
        height: Math.round(r.height),
      });
    };

    const ro = new ResizeObserver(sync);
    ro.observe(el);
    sync(); // fire immediately

    return () => {
      ro.disconnect();
      // On unmount, clear this panel
      ipc?.panelsSetActivePanel?.(null);
    };
  }, [panelId, ipc]);

  return containerRef;
}
