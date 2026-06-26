/**
 * Layout Store — panel arrangement with IPC persistence.
 *
 * Survives app restart via electron-store in the main process.
 */

import { create } from 'zustand';
import type { PanelContent } from '../components/PanelContentRenderer';

export interface PanelSlot {
  content: PanelContent;
  size: number;   // percentage
  visible: boolean;
}

const DEFAULT_SLOTS: PanelSlot[] = [
  { content: 'browser', size: 25, visible: true },
  { content: 'chat',    size: 50, visible: true },
  { content: 'editor',  size: 25, visible: true },
];

interface LayoutState {
  slots: PanelSlot[];
  dragging: number | null;
  setSlots: (slots: PanelSlot[]) => void;
  setDragging: (index: number | null) => void;
  resetLayout: () => void;
  swapPanels: (a: number, b: number) => void;
}

export const useLayoutStore = create<LayoutState>((set, get) => ({
  slots: DEFAULT_SLOTS,
  dragging: null,

  setSlots: (slots) => {
    set({ slots });
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('kore-layout-slots', JSON.stringify(slots));
      }
    } catch { /* fire and forget */ }
  },

  setDragging: (index) => set({ dragging: index }),

  resetLayout: () => {
    set({ slots: DEFAULT_SLOTS, dragging: null });
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('kore-layout-slots');
      }
    } catch { /* fire and forget */ }
  },

  swapPanels: (a, b) => {
    const slots = [...get().slots];
    const tmp = slots[a].content;
    slots[a] = { ...slots[a], content: slots[b].content };
    slots[b] = { ...slots[b], content: tmp };
    get().setSlots(slots);
  },
}));
