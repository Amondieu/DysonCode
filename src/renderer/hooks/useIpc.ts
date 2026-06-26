import { useEffect, useCallback, useState } from 'react';
import { GraphMode, useAppStore } from '../store/appStore';
import type { DysonAPI } from '../../main/preload';

declare global {
  interface Window {
    dyson: DysonAPI;
  }
}

export function useIpc() {
  return window.dyson;
}

export function useLoadSessions() {
  const { setSessions, setLastSessionData } = useAppStore();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [sessions, lastSession] = await Promise.all([
          window.dyson.getAllSessions(),
          window.dyson.getLastSessionWithMessages(),
        ]);
        setSessions(sessions);
        if (lastSession) {
          setLastSessionData(lastSession);
        }
      } catch (err) {
        console.error('Failed to load sessions:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return loading;
}

export function useLoadMessages(sessionId: number | null) {
  const { setMessages } = useAppStore();

  useEffect(() => {
    if (sessionId === null) {
      setMessages([]);
      return;
    }
    (async () => {
      const msgs = await window.dyson.getMessagesBySession(sessionId);
      setMessages(msgs);
    })();
  }, [sessionId]);
}

export function useTerminalLifecycle() {
  const { setTerminals, setActiveTerminal, activeTerminalId } = useAppStore();

  useEffect(() => {
    (async () => {
      const terms = await window.dyson.terminalList();
      setTerminals(terms);
      if (terms.length > 0 && !activeTerminalId) {
        setActiveTerminal(terms[0].id);
      }
    })();
  }, []);

  const createTerminal = useCallback(async (title?: string) => {
    const term = await window.dyson.createTerminal(title);
    setActiveTerminal(term.id);
    const terms = await window.dyson.terminalList();
    setTerminals(terms);
    return term;
  }, []);

  const killTerminal = useCallback(async (id: string) => {
    await window.dyson.terminalKill(id);
    const terms = await window.dyson.terminalList();
    setTerminals(terms);
  }, []);

  return { createTerminal, killTerminal };
}

export function useMissionControlBridge() {
  const {
    setMissionControl,
    setMissionControlStatus,
  } = useAppStore();

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const [state, status] = await Promise.all([
        window.dyson.getMissionControlState(),
        window.dyson.getMissionControlStatus(),
      ]);
      if (!mounted) {
        return;
      }
      setMissionControl(state);
      setMissionControlStatus(status);
    };

    load().catch((err) => {
      console.error('Failed to load mission control state:', err);
    });

    const offSnapshot = window.dyson.onMissionControlSnapshot((snapshot) => {
      setMissionControl(snapshot);
    });
    const offStatus = window.dyson.onMissionControlStatus((status) => {
      setMissionControlStatus(status);
    });

    return () => {
      mounted = false;
      offSnapshot();
      offStatus();
    };
  }, []);
}

export function useLoadGraph(sessionId: string | null, mode?: GraphMode) {
  const { loadGraph } = useAppStore();

  useEffect(() => {
    if (!sessionId) {
      return;
    }

    loadGraph(sessionId, mode).catch((err) => {
      console.error('Failed to load graph:', err);
    });
  }, [sessionId, mode, loadGraph]);
}
