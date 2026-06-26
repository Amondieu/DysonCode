export type ToolStatus = 'running' | 'done' | 'error';

export interface ToolCall {
  id: string;
  name: string;
  status: ToolStatus;
  durationMs?: number;
  error?: string;
}

export interface ReasoningBlock {
  id: string;
  text: string;
  collapsed: boolean;
}

export interface ContextRef {
  type: 'file' | 'symbol' | 'url';
  label: string;
  path?: string;
}

export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  streaming: boolean;
  collapsed?: boolean;
  toolCalls: ToolCall[];
  reasoning?: ReasoningBlock;
  contextRefs: ContextRef[];
  ts: number;
}

export interface ChatState {
  messages: ChatMessage[];
  busy: boolean;
  sessionId: string | null;
}
