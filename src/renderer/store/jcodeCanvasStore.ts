/**
 * Jcode Canvas Store — independent from chat state.
 *
 * Canvas state is NEVER shared with ChatPanel.
 * This prevents the "fixing one breaks the other" bug.
 */
import { create } from 'zustand';

export interface CanvasMessage {
  role: 'user' | 'assistant';
  content: string;
  nodeId?: string;
  timestamp: string;
}

interface JcodeCanvasState {
  messages: CanvasMessage[];
  activeNodeId: string | null;
  addMessage: (msg: CanvasMessage) => void;
  setActiveNode: (nodeId: string | null) => void;
  reset: () => void;
}

export const useJcodeCanvasStore = create<JcodeCanvasState>((set) => ({
  messages: [],
  activeNodeId: null,
  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  setActiveNode: (nodeId) => set({ activeNodeId: nodeId }),
  reset: () => set({ messages: [], activeNodeId: null }),
}));
