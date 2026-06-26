// src/renderer/components/ChatPanel/useChatIpc.ts
// P1.2 — Streaming abort with partial commit (A3)

import { useCallback, useRef } from 'react';
import type { ToolStatus, ContextRef } from './chat.types';

type DispatchFn = (action: any) => void;

export function useChatIpc(dispatch: DispatchFn) {
  const api = (window as any).electronAPI || (window as any).dyson;
  const currentMsgIdRef = useRef<string | null>(null);

  const send = useCallback(async (prompt: string, opts?: { model?: string }) => {
    const msgId = 'msg-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    currentMsgIdRef.current = msgId;

    // Create placeholder assistant message immediately
    dispatch({ type: 'MSG_START', id: msgId, role: 'assistant' });

    // Fire-and-forget: main process will stream events back via 'jcode:event'
    if (api.send) {
      api.send('jcode:run-stream', { msgId, message: prompt, ...opts });
    } else if (api.invoke) {
      // Fallback: non-streaming invoke
      try {
        const result = await api.invoke('jcode:run', { message: prompt, ...opts });
        if (result?.ok && result.events) {
          let hasContent = false;
          for (const event of result.events) {
            switch (event.type) {
              case 'token':
              case 'text_delta': {
                const text = event.content || event.text || '';
                if (text) hasContent = true;
                dispatch({ type: 'TOKEN', id: msgId, token: text });
                break;
              }
              case 'tool_start':
                dispatch({ type: 'TOOL_START', msgId, toolId: 'tool-' + (event.id || Date.now().toString(36)), name: event.name || event.tool || 'tool' });
                break;
              case 'tool_done':
                dispatch({ type: 'TOOL_END', msgId, toolId: 'tool-' + (event.id || Date.now().toString(36)), status: event.error ? 'error' as ToolStatus : 'done' as ToolStatus, durationMs: event.duration_ms || 0 });
                break;
              case 'error':
                dispatch({ type: 'TOKEN', id: msgId, token: `\n\nError: ${event.message || event.content || ''}` });
                break;
            }
          }
          if (!hasContent) {
            dispatch({ type: 'TOKEN', id: msgId, token: '(no response)' });
          }
        } else if (result?.error) {
          dispatch({ type: 'TOKEN', id: msgId, token: `\n\nError: ${result.error}` });
        }
        dispatch({ type: 'MSG_END', id: msgId });
      } catch (e) {
        dispatch({ type: 'TOKEN', id: msgId, token: `\n\nError: ${(e as Error).message}` });
        dispatch({ type: 'MSG_END', id: msgId });
      }
    }
  }, [dispatch, api]);

  // P1.2: Cancel stream with partial commit — appends [⚡ Aborted] and commits
  const cancel = useCallback(() => {
    const msgId = currentMsgIdRef.current;
    if (api.send) {
      api.send('jcode:cancel-stream');
    }
    if (msgId) {
      // Commit partial content with abort marker (A3)
      dispatch({ type: 'TOKEN', id: msgId, token: '\n\n[⚡ Aborted]' });
      dispatch({ type: 'MSG_END', id: msgId });
      currentMsgIdRef.current = null;
    }
  }, [api, dispatch]);

  const reset = useCallback(() => dispatch({ type: 'RESET' }), [dispatch]);

  return { send, cancel, reset, currentMsgIdRef };
}
