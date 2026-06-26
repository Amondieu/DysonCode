import fs from 'fs';
import path from 'path';
import os from 'os';
import type { DysonIntelligence, KnowledgeItem } from './types';

function findBusDir(): string | null {
  const candidates = [
    path.join(os.homedir(), '.jcode', 'bus'),
    path.join(os.homedir(), 'ShadowDrive', '0.1.Ai', '.jcode', 'bus'),
    path.join(process.cwd(), '..', '.jcode', 'bus'),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir;
  }
  return null;
}

function safeReadDir(dir: string): string[] {
  try { return fs.readdirSync(dir); } catch { return []; }
}

function safeReadFile(filePath: string, maxBytes = 2048): string {
  try { return fs.readFileSync(filePath, 'utf-8').slice(0, maxBytes); } catch { return ''; }
}

let cachedIntelligence: DysonIntelligence | null = null;

export function harvestDysonIntelligence(): DysonIntelligence | null {
  const busDir = findBusDir();
  if (!busDir) return null;

  const files = safeReadDir(busDir);
  const kiFiles = files.filter((f) => f.startsWith('KI-') && (f.endsWith('.yaml') || f.endsWith('.yml') || f.endsWith('.json') || f.endsWith('.md')));

  // Also check for knowledge.json
  const knowledgeJson = path.join(busDir, 'knowledge.json');
  let items: KnowledgeItem[] = [];

  if (fs.existsSync(knowledgeJson)) {
    try {
      const raw = JSON.parse(safeReadFile(knowledgeJson, 32768));
      if (Array.isArray(raw)) {
        items = raw.map((item: Record<string, unknown>) => ({
          id: String(item.id || 'unknown'),
          content: String(item.content || '').slice(0, 400),
          hScore: Number(item.hScore || item.score || 0),
          source: String(item.source || 'knowledge.json'),
          harvestedAt: new Date().toISOString(),
        }));
      }
    } catch { /* ignore parse errors */ }
  }

  // Fallback: read KI-*.yaml files directly
  if (items.length === 0 && kiFiles.length > 0) {
    items = kiFiles.slice(0, 5).map((file) => {
      const content = safeReadFile(path.join(busDir, file));
      const scoreMatch = content.match(/hScore:\s*(\d+\.?\d*)/);
      return {
        id: file.replace(/\.(yaml|yml|json|md)$/, ''),
        content: content.slice(0, 400),
        hScore: scoreMatch ? parseFloat(scoreMatch[1]) : 0,
        source: file,
        harvestedAt: new Date().toISOString(),
      };
    });
  }

  if (items.length === 0) return null;

  const summary = items.slice(0, 3).map((ki) => `[${ki.id}] ${ki.content.slice(0, 80)}`).join(' | ');
  return {
    knowledgeItems: items,
    summary,
    harvestedAt: new Date().toISOString(),
  };
}

export function getCachedIntelligence(): DysonIntelligence | null {
  if (cachedIntelligence) return cachedIntelligence;
  return refreshIntelligence();
}

export function refreshIntelligence(): DysonIntelligence | null {
  cachedIntelligence = harvestDysonIntelligence();
  return cachedIntelligence;
}
