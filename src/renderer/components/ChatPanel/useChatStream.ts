import { useEffect, useReducer } from 'react';
import type { ChatMessage, ChatState, ToolStatus, ContextRef } from './chat.types';

type Action =
  | { type: 'MSG_START'; id: string; role: string }
  | { type: 'TOKEN'; id: string; token: string }
  | { type: 'TOKEN_BATCH'; batch: Map<string, string> }
  | { type: 'TOGGLE_COLLAPSE'; msgId: string }
  | { type: 'MSG_END'; id: string }
  | { type: 'TOOL_START'; msgId: string; toolId: string; name: string }
  | { type: 'TOOL_END'; msgId: string; toolId: string; status: ToolStatus; durationMs: number }
  | { type: 'REASONING'; msgId: string; text: string; collapsed: boolean }
  | { type: 'CONTEXT_REF'; msgId: string; ref: ContextRef }
  | { type: 'SESSION'; sessionId: string }
  | { type: 'RESET' };

function reducer(state: ChatState, action: Action): ChatState {
  switch (action.type) {
    case 'SESSION':
      return { ...state, sessionId: action.sessionId };
    case 'MSG_START': {
      const msg: ChatMessage = {
        id: action.id,
        role: action.role as any,
        content: '',
        streaming: true,
        toolCalls: [],
        contextRefs: [],
        ts: Date.now(),
      };
      return { ...state, busy: true, messages: [...state.messages, msg] };
    }
    case 'TOKEN':
      return {
        ...state,
        messages: state.messages.map(m =>
          m.id === action.id ? { ...m, content: m.content + action.token } : m
        ),
      };
    case 'TOKEN_BATCH': {
      if (action.batch.size === 0) return state;
      return {
        ...state,
        messages: state.messages.map(m => {
          const chunk = action.batch.get(m.id);
          return chunk ? { ...m, content: m.content + chunk } : m;
        }),
      };
    }
    case 'MSG_END':
      return {
        ...state, busy: false,
        messages: state.messages.map(m =>
          m.id === action.id
            ? { ...m, streaming: false, collapsed: m.content.length > 600 && m.role === 'assistant' }
            : m
        ),
      };
    case 'TOOL_START':
      return {
        ...state,
        messages: state.messages.map(m =>
          m.id === action.msgId
            ? { ...m, toolCalls: [...m.toolCalls, { id: action.toolId, name: action.name, status: 'running' as ToolStatus }] }
            : m
        ),
      };
    case 'TOOL_END':
      return {
        ...state,
        messages: state.messages.map(m =>
          m.id === action.msgId
            ? {
                ...m,
                toolCalls: m.toolCalls.map(t =>
                  t.id === action.toolId
                    ? { ...t, status: action.status, durationMs: action.durationMs }
                    : t
                ),
              }
            : m
        ),
      };
    case 'REASONING':
      return {
        ...state,
        messages: state.messages.map(m =>
          m.id === action.msgId
            ? { ...m, reasoning: { id: m.id + '-r', text: action.text, collapsed: action.collapsed } }
            : m
        ),
      };
    case 'CONTEXT_REF':
      return {
        ...state,
        messages: state.messages.map(m =>
          m.id === action.msgId
            ? { ...m, contextRefs: [...m.contextRefs, action.ref] }
            : m
        ),
      };
    case 'TOGGLE_COLLAPSE':
      return {
        ...state,
        messages: state.messages.map(m =>
          m.id === action.msgId ? { ...m, collapsed: !m.collapsed } : m
        ),
      };
    case 'RESET':
      return { messages: [], busy: false, sessionId: state.sessionId };
    default:
      return state;
  }
}

const INITIAL: ChatState = {
  messages: [
    {
      id: 'seed',
      role: 'assistant',
      content: 'jcode v0.31.2 ready. Type a message to start.',
      streaming: false,
      toolCalls: [],
      contextRefs: [],
      ts: Date.now(),
    },
  ],
  busy: false,
  sessionId: null,
};

export function useChatStream() {
  const [state, dispatch] = useReducer(reducer, INITIAL);

  useEffect(() => {
    const api = (window as any).electronAPI || (window as any).dyson;
    if (!api?.on) return;

    // ── Token batching ──────────────────────────────────────────────────
    // Collect individual token events into a map, flush once per animation frame.
    // This prevents React from re-rendering on every single token (100+ renders/sec).
    const tokenBuffer = new Map<string, string>();
    let rafPending = false;

    const flushTokens = () => {
      rafPending = false;
      if (tokenBuffer.size === 0) return;
      const batch = new Map(tokenBuffer);
      tokenBuffer.clear();
      dispatch({ type: 'TOKEN_BATCH', batch });
    };

    const onToken = (d: { id: string; token?: string; text?: string }) => {
      const text = d.token ?? d.text ?? '';
      if (!text) return;
      tokenBuffer.set(d.id, (tokenBuffer.get(d.id) ?? '') + text);
      if (!rafPending) {
        rafPending = true;
        requestAnimationFrame(flushTokens);
      }
    };

    // ── Streaming event from main process (jcode:run-stream) ────────────
    // Each NDJSON line is forwarded as a 'jcode:event' IPC message.
    const onJcodeEvent = (payload: { msgId: string; event: { type: string; content?: string; text?: string; message?: string; tool?: string; name?: string; id?: string; error?: string; duration_ms?: number; session_id?: string } }) => {
      const { msgId, event } = payload;

      // Token batching via TOKEN_BATCH — use the onToken accumulator
      // for fast token events. For other events, dispatch directly.
      switch (event.type) {
        case 'token':
        case 'text_delta': {
          const text = event.content ?? event.text ?? '';
          if (!text) break;
          tokenBuffer.set(msgId, (tokenBuffer.get(msgId) ?? '') + text);
          if (!rafPending) {
            rafPending = true;
            requestAnimationFrame(flushTokens);
          }
          break;
        }
        case 'tool_start':
          dispatch({
            type: 'TOOL_START',
            msgId,
            toolId: 'tool-' + (event.id || Date.now().toString(36) + Math.random().toString(36).slice(2, 6)),
            name: event.name || event.tool || 'tool',
          });
          break;
        case 'tool_done':
          dispatch({
            type: 'TOOL_END',
            msgId,
            toolId: 'tool-' + (event.id || Date.now().toString(36)),
            status: event.error ? 'error' as ToolStatus : 'done' as ToolStatus,
            durationMs: event.duration_ms || 0,
          });
          break;
        case 'error':
          dispatch({ type: 'TOKEN', id: msgId, token: `\n\nError: ${event.message || event.content || ''}` });
          break;
        case 'session_id':
          dispatch({ type: 'SESSION', sessionId: event.session_id || '' });
          break;
      }
    };

    const onDoneStream = (payload: { msgId: string }) => {
      dispatch({ type: 'MSG_END', id: payload.msgId });
    };

    const subs = [
      api.on('jcode:session', (d: any) => dispatch({ type: 'SESSION', sessionId: d.sessionId })),
      api.on('jcode:msg-start', (d: any) => dispatch({ type: 'MSG_START', id: d.id, role: d.role })),
      api.on('jcode:token', onToken),
      api.on('jcode:msg-end', (d: any) => dispatch({ type: 'MSG_END', id: d.id })),
      api.on('jcode:tool-start', (d: any) => dispatch({ type: 'TOOL_START', msgId: d.msgId, toolId: d.toolId, name: d.name })),
      api.on('jcode:tool-end', (d: any) => dispatch({ type: 'TOOL_END', msgId: d.msgId, toolId: d.toolId, status: d.status, durationMs: d.durationMs })),
      api.on('jcode:reasoning', (d: any) => dispatch({ type: 'REASONING', msgId: d.msgId, text: d.text, collapsed: d.collapsed })),
      api.on('jcode:context-ref', (d: any) => dispatch({ type: 'CONTEXT_REF', msgId: d.msgId, ref: d.ref })),
      api.on('jcode:reset', () => dispatch({ type: 'RESET' })),
      // Streaming IPC events from jcode:run-stream
      api.on('jcode:event', onJcodeEvent),
      api.on('jcode:done-stream', onDoneStream),
    ];

    return () => {
      // Flush remaining tokens on unmount
      if (rafPending) flushTokens();
      subs.forEach(fn => fn?.());
    };
  }, []);

  return { ...state, dispatch };
}
