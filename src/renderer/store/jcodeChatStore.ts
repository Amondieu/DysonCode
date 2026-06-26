/**
 * Jcode Chat Store — independent from canvas/graph state.
 *
 * Chat messages are NEVER shared with FlowCanvas or any graph component.
 * This prevents the "fixing one breaks the other" bug.
 */
import { create } from 'zustand';

export interface JcodeChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
}

interface JcodeChatState {
  messages: JcodeChatMessage[];
  addMessage: (msg: JcodeChatMessage) => void;
  reset: () => void;
}

export const useJcodeChatStore = create<JcodeChatState>((set) => ({
  messages: [],
  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  reset: () => set({ messages: [] }),
}));
