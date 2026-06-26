// src/main/routing-profile.ts
// P2.4 — Cross-session routing corrections persistence

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

interface RoutingCorrection {
  ts: string;
  intent: string;
  suggested: string;
  chosen: string;
}

const CORRECTIONS_PATH = path.join(os.homedir(), '.jcode', 'routing-corrections.jsonl');

export function logCorrection(intent: string, suggested: string, chosen: string): void {
  const entry: RoutingCorrection = {
    ts: new Date().toISOString(),
    intent: intent.slice(0, 200),
    suggested,
    chosen,
  };
  try {
    fs.mkdirSync(path.dirname(CORRECTIONS_PATH), { recursive: true });
    fs.appendFileSync(CORRECTIONS_PATH, JSON.stringify(entry) + '\n');
  } catch { /* never block on log write */ }
}

export function getCorrectionCount(): number {
  try {
    if (!fs.existsSync(CORRECTIONS_PATH)) return 0;
    return fs.readFileSync(CORRECTIONS_PATH, 'utf-8')
      .split('\n').filter(l => l.trim()).length;
  } catch { return 0; }
}

export function buildUserRoutingOverrides(): Record<string, string> {
  try {
    if (!fs.existsSync(CORRECTIONS_PATH)) return {};
    const corrections: RoutingCorrection[] = fs
      .readFileSync(CORRECTIONS_PATH, 'utf-8')
      .split('\n')
      .filter(l => l.trim())
      .map(l => JSON.parse(l));

    const wordModeMap: Record<string, string[]> = {};
    for (const c of corrections) {
      for (const word of c.intent.toLowerCase().split(/\s+/)) {
        if (word.length > 4) {
          if (!wordModeMap[word]) wordModeMap[word] = [];
          wordModeMap[word].push(c.chosen);
        }
      }
    }

    const overrides: Record<string, string> = {};
    for (const [word, modes] of Object.entries(wordModeMap)) {
      if (modes.length >= 3) {
        const counts = modes.reduce((acc, m) => {
          acc[m] = (acc[m] ?? 0) + 1; return acc;
        }, {} as Record<string, number>);
        const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
        if (top[1] === modes.length) {
          overrides[word] = top[0];
        }
      }
    }
    return overrides;
  } catch { return {}; }
}

const DEFAULT_MAP: [string, string][] = [
  ['trade-off', 'deep'], ['architecture', 'deep'], ['evaluate', 'deep'],
  ['compare', 'deep'], ['analyze', 'deep'], ['explain', 'deep'],
  ['design', 'deep'], ['why ', 'deep'],
  ['audit', 'audit'], ['inspect', 'audit'], ['verify', 'audit'],
  ['report', 'audit'], ['scan', 'audit'],
  ['brainstorm', 'inventor'], ['ideate', 'inventor'], ['invent', 'inventor'],
  ['generate', 'inventor'], ['propose', 'inventor'],
  ['implement', 'balanced'], ['refactor', 'balanced'], ['fix ', 'balanced'],
  ['update', 'balanced'], ['add ', 'balanced'], ['write', 'balanced'],
  ['lookup', 'fast'], ['search', 'fast'], ['find ', 'fast'],
  ['what is', 'fast'], ['list ', 'fast'], ['show me', 'fast'],
];

export function routeIntent(message: string, currentMode: string): {
  suggestedMode: string;
  confidence: number;
  source: 'personal' | 'default' | 'current';
} {
  const lower = message.toLowerCase();
  const overrides = buildUserRoutingOverrides();

  for (const [word, mode] of Object.entries(overrides)) {
    if (lower.includes(word)) {
      return { suggestedMode: mode, confidence: 0.9, source: 'personal' };
    }
  }

  for (const [keyword, mode] of DEFAULT_MAP) {
    if (lower.includes(keyword)) {
      return { suggestedMode: mode, confidence: 0.75, source: 'default' };
    }
  }

  return { suggestedMode: currentMode, confidence: 0, source: 'current' };
}
