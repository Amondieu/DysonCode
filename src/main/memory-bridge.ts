/**
 * MemoryBridge — persists Electron window state, mode, and UI preferences
 * between app launches. Singleton per main process lifetime.
 *
 * Data stored at: {userData}/session-cache.json
 */

import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

// ── Types ───────────────────────────────────────────────────────────────────

export interface WindowState {
  width: number;
  height: number;
  x: number | undefined;
  y: number | undefined;
  maximized: boolean;
}

export interface UiPreferences {
  sidebarOpen: boolean;
  theme: 'dark' | 'light';
  streamingEnabled: boolean;
}

export interface TokenStats {
  totalTokensThisWeek: number;
  lastResetDate: string;
}

export interface ElectronSessionCache {
  lastSessionId: string | null;
  lastMode: string;
  windowState: WindowState;
  uiPreferences: UiPreferences;
  tokenStats: TokenStats;
}

// ── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_CACHE: ElectronSessionCache = {
  lastSessionId: null,
  lastMode: 'balanced',
  windowState: { width: 1200, height: 800, x: undefined, y: undefined, maximized: false },
  uiPreferences: { sidebarOpen: true, theme: 'dark', streamingEnabled: true },
  tokenStats: { totalTokensThisWeek: 0, lastResetDate: new Date().toISOString() },
};

// ── MemoryBridge ─────────────────────────────────────────────────────────────

export class MemoryBridge {
  private cache: ElectronSessionCache = DEFAULT_CACHE;
  private readonly cachePath: string;

  constructor() {
    this.cachePath = path.join(app.getPath('userData'), 'session-cache.json');
    this.load();
  }

  /** Load cached state from disk (silent on failure). */
  private load(): void {
    try {
      if (fs.existsSync(this.cachePath)) {
        const raw = fs.readFileSync(this.cachePath, 'utf-8');
        this.cache = { ...DEFAULT_CACHE, ...JSON.parse(raw) };
      }
    } catch {
      this.cache = { ...DEFAULT_CACHE };
    }
  }

  /** Persist current cache to disk immediately. */
  save(): void {
    try {
      const dir = path.dirname(this.cachePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.cachePath, JSON.stringify(this.cache, null, 2), 'utf-8');
    } catch {
      // Never block on cache write failure
    }
  }

  /** Get a cached value by key. */
  get<K extends keyof ElectronSessionCache>(key: K): ElectronSessionCache[K] {
    return this.cache[key];
  }

  /** Set a cached value and persist immediately. */
  set<K extends keyof ElectronSessionCache>(key: K, value: ElectronSessionCache[K]): void {
    this.cache[key] = value;
    this.save();
  }

  /** Update token usage stats with weekly auto-reset. */
  updateTokenStats(tokensUsed: number): void {
    const stats = this.cache.tokenStats;
    const lastReset = new Date(stats.lastResetDate);
    const now = new Date();
    const daysSince = (now.getTime() - lastReset.getTime()) / 86_400_000;

    // Reset on Sunday or if >7 days since last reset
    if (daysSince >= 7 || (now.getDay() === 0 && lastReset.getDay() !== 0)) {
      stats.totalTokensThisWeek = tokensUsed;
      stats.lastResetDate = now.toISOString();
    } else {
      stats.totalTokensThisWeek += tokensUsed;
    }
    this.save();
  }
}

// Singleton
let _instance: MemoryBridge | null = null;

export function getMemoryBridge(): MemoryBridge {
  if (!_instance) {
    _instance = new MemoryBridge();
  }
  return _instance;
}
