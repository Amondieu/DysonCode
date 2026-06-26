/**
 * Kore Memory Graph — lightweight working memory with temperature semantics.
 *
 * Stores conversation turns, decisions, and constraints as memory nodes
 * with hot/warm/cold temperature. Hot nodes are injected into LLM context.
 *
 * Backed by a JSON file in the user data directory (no DB dependency).
 */

import { ipcMain } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

// ── Types ───────────────────────────────────────────────────────────────────

type NodeTemperature = 'hot' | 'warm' | 'cold';
type NodeKind = 'turn' | 'decision' | 'constraint' | 'observation' | 'failure';

interface MemoryNode {
  id: string;
  sessionId: string;
  kind: NodeKind;
  temperature: NodeTemperature;
  content: string;
  timestamp: number;
}

interface MemoryStore {
  nodes: MemoryNode[];
}

// ── Store ────────────────────────────────────────────────────────────────────

function getStorePath(): string {
  return path.join(os.homedir(), '.dysoncode', 'kore-memory.json');
}

function loadStore(): MemoryStore {
  try {
    const p = getStorePath();
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, 'utf-8'));
    }
  } catch {}
  return { nodes: [] };
}

function saveStore(store: MemoryStore) {
  try {
    const p = getStorePath();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(store, null, 2), 'utf-8');
  } catch {}
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function nodeId(): string {
  return 'mem_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

function coolNodes(nodes: MemoryNode[]): MemoryNode[] {
  const now = Date.now();
  return nodes.map(n => {
    const ageHours = (now - n.timestamp) / (1000 * 60 * 60);
    if (ageHours > 24) return { ...n, temperature: 'cold' as NodeTemperature };
    if (ageHours > 4) return { ...n, temperature: 'warm' as NodeTemperature };
    return n;
  });
}

// ── IPC Handlers ─────────────────────────────────────────────────────────────

export function registerMemoryHandlers() {
  // Store a memory node
  ipcMain.handle('memory:store', async (_e: any, node: {
    sessionId: string;
    kind: string;
    content: string;
  }) => {
    try {
      const store = loadStore();
      const memoryNode: MemoryNode = {
        id: nodeId(),
        sessionId: node.sessionId,
        kind: node.kind as NodeKind,
        temperature: 'hot',
        content: node.content,
        timestamp: Date.now(),
      };
      store.nodes.push(memoryNode);
      // Keep max 500 nodes, remove oldest cold ones
      if (store.nodes.length > 500) {
        store.nodes.sort((a, b) => a.timestamp - b.timestamp);
        store.nodes = store.nodes.slice(-500);
      }
      saveStore(store);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });

  // Get context (hot/warm nodes) for a session
  ipcMain.handle('memory:getContext', async (_e: any, sessionId: string) => {
    try {
      const store = loadStore();
      const cooled = coolNodes(store.nodes);
      const sessionNodes = cooled.filter(n => n.sessionId === sessionId);
      // Return hot + warm nodes, sorted newest first, limited to 10
      const contextNodes = sessionNodes
        .filter(n => n.temperature === 'hot' || n.temperature === 'warm')
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 10);
      saveStore({ nodes: cooled }); // persist temperature decay
      return {
        ok: true,
        nodes: contextNodes.map(n => ({
          kind: n.kind,
          content: n.content,
          temperature: n.temperature,
        })),
      };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });

  // Clear memory for a session
  ipcMain.handle('memory:clear', async (_e: any, sessionId: string) => {
    try {
      const store = loadStore();
      store.nodes = store.nodes.filter(n => n.sessionId !== sessionId);
      saveStore(store);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });
}
