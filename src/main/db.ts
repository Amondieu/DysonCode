import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

let DB_PATH: string | null = null;

export function setDbPath(dbPath: string) {
  DB_PATH = dbPath;
}

function getDbPath(): string {
  if (!DB_PATH) {
    throw new Error('DB path not set. Call setDbPath() first.');
  }
  return DB_PATH;
}

let db: Database.Database | null = null;

function ensureColumn(tableName: string, columnName: string, definition: string) {
  if (!db) return;
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  if (!columns.some((column) => column.name === columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

function migrateLegacySchema() {
  if (!db) return;

  ensureColumn('sessions', 'text_id', 'TEXT');
  db.exec(`
    UPDATE sessions
    SET text_id = 'sess_' || CAST(id AS TEXT)
    WHERE text_id IS NULL OR text_id = ''
  `);

  ensureColumn('prompt_vault', 'source_id', 'TEXT');
  ensureColumn('prompt_vault', 'score', 'REAL');

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_prompt_vault_source_id
    ON prompt_vault(source_id)
    WHERE source_id IS NOT NULL
  `);
}

export async function getDb(): Promise<Database.Database> {
  if (!db) {
    const dbPath = getDbPath();
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.pragma('synchronous = NORMAL');
    initSchema();
    migrateLegacySchema();
  }
  return db;
}

function initSchema() {
  if (!db) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL DEFAULT 'New Session',
      repo_path TEXT,
      text_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      is_active INTEGER NOT NULL DEFAULT 1
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system', 'tool')),
      content TEXT NOT NULL,
      tool_calls TEXT,
      tool_results TEXT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS session_summaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL UNIQUE,
      summary TEXT NOT NULL,
      key_files TEXT,
      key_decisions TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS prompt_vault (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      task_type TEXT NOT NULL DEFAULT 'general',
      version TEXT NOT NULL DEFAULT 'v1',
      tags_json TEXT NOT NULL DEFAULT '[]',
      template TEXT NOT NULL,
      pinned INTEGER NOT NULL DEFAULT 0,
      use_count INTEGER NOT NULL DEFAULT 0,
      last_used_at TEXT,
      source_id TEXT,
      score REAL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS nodes (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      session_id TEXT,
      node_type TEXT NOT NULL,
      mode_origin TEXT NOT NULL DEFAULT 'flow',
      label TEXT,
      data TEXT NOT NULL DEFAULT '{}',
      rc_score REAL DEFAULT 0,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS edges (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      session_id TEXT,
      source_id TEXT REFERENCES nodes(id) ON DELETE CASCADE,
      target_id TEXT REFERENCES nodes(id) ON DELETE CASCADE,
      edge_type TEXT DEFAULT 'data',
      label TEXT,
      animated INTEGER DEFAULT 0,
      mode_visible TEXT DEFAULT 'all'
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS node_views (
      node_id TEXT REFERENCES nodes(id) ON DELETE CASCADE,
      mode TEXT NOT NULL,
      pos_x REAL DEFAULT 0,
      pos_y REAL DEFAULT 0,
      width REAL,
      height REAL,
      hidden INTEGER DEFAULT 0,
      z_index INTEGER DEFAULT 0,
      updated_at INTEGER DEFAULT (unixepoch()),
      PRIMARY KEY (node_id, mode)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS repo_registry (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      path TEXT NOT NULL UNIQUE,
      name TEXT,
      rc_score REAL DEFAULT 0,
      harness_score REAL DEFAULT 0,
      session_velocity REAL DEFAULT 0,
      tension_level INTEGER DEFAULT 0,
      last_polled INTEGER,
      meta TEXT DEFAULT '{}'
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS execution_log (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      session_id TEXT,
      node_id TEXT REFERENCES nodes(id),
      input TEXT,
      output TEXT,
      status TEXT DEFAULT 'pending',
      duration_ms INTEGER,
      created_at INTEGER DEFAULT (unixepoch())
    )
  `);

  db.exec('CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions(updated_at DESC)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_prompt_vault_pinned ON prompt_vault(pinned DESC, use_count DESC)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_nodes_session ON nodes(session_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_node_views_mode ON node_views(mode)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_execution_log_node ON execution_log(node_id)');
  seedPromptVault();
}

function seedPromptVault() {
  if (!db) return;
  const row = execOne<{ count: number }>('SELECT COUNT(*) as count FROM prompt_vault');
  if ((row?.count ?? 0) > 0) {
    return;
  }

  const seeds = [
    {
      title: 'Architect Breakdown',
      taskType: 'planning',
      version: 'v1',
      tags: ['architect', 'graph', 'planning'],
      template:
        'Break the spec into the smallest dependency-safe implementation graph. Return only the ordered modules, constraints, and acceptance checks.'
    },
    {
      title: 'Builder Tight Loop',
      taskType: 'implementation',
      version: 'v1',
      tags: ['builder', 'tight-loop', 'minimal-diff'],
      template:
        'Implement the smallest reversible change that satisfies the current requirement. Prefer local validation before expanding scope.'
    },
    {
      title: 'Critic Falsifier',
      taskType: 'review',
      version: 'v1',
      tags: ['critic', 'falsifier', 'risk'],
      template:
        'Act as a falsifier. List the smallest concrete failure modes, regression risks, and missing validation for the proposed change.'
    },
    {
      title: 'Research Extract',
      taskType: 'research',
      version: 'v1',
      tags: ['research', 'summary', 'inject'],
      template:
        'Summarize the external material into directly usable implementation constraints, edge cases, and decisions for this repo.'
    },
    {
      title: 'Session Memory Snapshot',
      taskType: 'memory',
      version: 'v1',
      tags: ['memory', 'summary', 'handoff'],
      template:
        'Compress the current work into goal, changed files, decisions, open tensions, and the next three concrete steps.'
    },
  ];

  for (const seed of seeds) {
    db.prepare(
      `INSERT INTO prompt_vault (title, task_type, version, tags_json, template, pinned)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
        seed.title,
        seed.taskType,
        seed.version,
        JSON.stringify(seed.tags),
        seed.template,
        1,
    );
  }
}

// ---- Helpers ----

function execAll<T>(sql: string, params?: any[]): T[] {
  if (!db) throw new Error('DB not initialized');
  const stmt = db.prepare(sql);
  return (params ? stmt.all(...params) : stmt.all()) as T[];
}

function execOne<T>(sql: string, params?: any[]): T | undefined {
  if (!db) throw new Error('DB not initialized');
  const stmt = db.prepare(sql);
  return (params ? stmt.get(...params) : stmt.get()) as T | undefined;
}

function execRun(sql: string, params?: any[]) {
  if (!db) throw new Error('DB not initialized');
  const stmt = db.prepare(sql);
  return params ? stmt.run(...params) : stmt.run();
}

// ---- Session CRUD ----

export interface SessionRow {
  id: number;
  title: string;
  repo_path: string | null;
  text_id?: string | null;
  created_at: string;
  updated_at: string;
  is_active: number;
}

export async function createSession(title: string, repoPath?: string): Promise<SessionRow> {
  await getDb();
  const result = execRun('INSERT INTO sessions (title, repo_path) VALUES (?, ?)', [title, repoPath ?? null]);
  const insertedId = Number(result.lastInsertRowid);
  execRun(`UPDATE sessions SET text_id = COALESCE(text_id, 'sess_' || CAST(id AS TEXT)) WHERE id = ?`, [insertedId]);
  const row = execOne<Record<string, any>>('SELECT * FROM sessions WHERE id = ?', [insertedId]);
  return row as unknown as SessionRow;
}

export async function getAllSessions(): Promise<SessionRow[]> {
  await getDb();
  return execAll<SessionRow>('SELECT * FROM sessions ORDER BY updated_at DESC');
}

export async function getSessionById(id: number): Promise<SessionRow | undefined> {
  await getDb();
  return execOne<SessionRow>('SELECT * FROM sessions WHERE id = ?', [id]);
}

export async function updateSessionTitle(id: number, title: string) {
  await getDb();
  execRun("UPDATE sessions SET title = ?, updated_at = datetime('now') WHERE id = ?", [title, id]);
}

export async function touchSession(id: number) {
  await getDb();
  execRun("UPDATE sessions SET updated_at = datetime('now') WHERE id = ?", [id]);
}

export async function deleteSession(id: number) {
  await getDb();
  execRun('DELETE FROM sessions WHERE id = ?', [id]);
}

// ---- Message CRUD ----

export interface MessageRow {
  id: number;
  session_id: number;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  tool_calls: string | null;
  tool_results: string | null;
  timestamp: string;
}

export async function insertMessage(
  sessionId: number,
  role: MessageRow['role'],
  content: string,
  toolCalls?: string,
  toolResults?: string
): Promise<MessageRow> {
  await getDb();
  execRun(
    'INSERT INTO messages (session_id, role, content, tool_calls, tool_results) VALUES (?, ?, ?, ?, ?)',
    [sessionId, role, content, toolCalls ?? null, toolResults ?? null]
  );
  await touchSession(sessionId);
  const row = execOne<Record<string, any>>('SELECT * FROM messages WHERE id = last_insert_rowid()');
  return row as unknown as MessageRow;
}

export async function getMessagesBySession(sessionId: number): Promise<MessageRow[]> {
  await getDb();
  return execAll<MessageRow>('SELECT * FROM messages WHERE session_id = ? ORDER BY id ASC', [sessionId]);
}

export async function getLastSessionWithMessages(): Promise<{ session: SessionRow; messages: MessageRow[] } | null> {
  await getDb();
  const sessions = execAll<SessionRow>(
    `SELECT s.* FROM sessions s
     INNER JOIN messages m ON m.session_id = s.id
     GROUP BY s.id
     ORDER BY s.updated_at DESC
     LIMIT 1`
  );

  if (sessions.length === 0) return null;
  const session = sessions[0];
  const messages = await getMessagesBySession(session.id);
  return { session, messages };
}

// ---- Session Summaries ----

export async function upsertSessionSummary(
  sessionId: number,
  summary: string,
  keyFiles?: string,
  keyDecisions?: string
) {
  await getDb();
  execRun(
    `INSERT INTO session_summaries (session_id, summary, key_files, key_decisions)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(session_id) DO UPDATE SET
       summary = excluded.summary,
       key_files = excluded.key_files,
       key_decisions = excluded.key_decisions,
       created_at = datetime('now')`,
    [sessionId, summary, keyFiles ?? null, keyDecisions ?? null]
  );
}

export async function getSessionSummary(sessionId: number) {
  await getDb();
  return execOne('SELECT * FROM session_summaries WHERE session_id = ?', [sessionId]);
}

// ---- Prompt Vault ----

export interface PromptVaultRow {
  id: number;
  title: string;
  task_type: string;
  version: string;
  tags_json: string;
  template: string;
  pinned: number;
  use_count: number;
  last_used_at: string | null;
  created_at: string;
}

export async function getPromptVault(search = ''): Promise<PromptVaultRow[]> {
  await getDb();
  const needle = `%${search.trim().toLowerCase()}%`;
  if (!search.trim()) {
    return execAll<PromptVaultRow>(
      `SELECT * FROM prompt_vault
       ORDER BY pinned DESC, use_count DESC, created_at DESC`
    );
  }

  return execAll<PromptVaultRow>(
    `SELECT * FROM prompt_vault
     WHERE lower(title) LIKE ?
        OR lower(task_type) LIKE ?
        OR lower(version) LIKE ?
        OR lower(tags_json) LIKE ?
        OR lower(template) LIKE ?
     ORDER BY pinned DESC, use_count DESC, created_at DESC`,
    [needle, needle, needle, needle, needle]
  );
}

export async function createPromptVaultEntry(
  title: string,
  taskType: string,
  version: string,
  tagsJson: string,
  template: string
): Promise<PromptVaultRow> {
  await getDb();
  execRun(
    `INSERT INTO prompt_vault (title, task_type, version, tags_json, template)
     VALUES (?, ?, ?, ?, ?)`,
    [title, taskType, version, tagsJson, template]
  );
  const row = execOne<Record<string, any>>('SELECT * FROM prompt_vault WHERE id = last_insert_rowid()');
  return row as unknown as PromptVaultRow;
}

export async function setPromptVaultPinned(id: number, pinned: boolean): Promise<void> {
  await getDb();
  execRun('UPDATE prompt_vault SET pinned = ? WHERE id = ?', [pinned ? 1 : 0, id]);
}

export async function recordPromptVaultUse(id: number): Promise<void> {
  await getDb();
  execRun(
    `UPDATE prompt_vault
     SET use_count = use_count + 1,
         last_used_at = datetime('now')
     WHERE id = ?`,
    [id]
  );
}

export async function deletePromptVaultEntry(id: number): Promise<void> {
  await getDb();
  execRun('DELETE FROM prompt_vault WHERE id = ?', [id]);
}

export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}
