import * as fs from 'fs';
import { getDb } from './db';

interface VaultImportEntry {
  id?: string;
  task_type: string;
  version: string;
  tags: string[];
  template: string;
  pinned?: boolean;
  score?: number;
}

interface ImportResult {
  imported: number;
  skipped: number;
}

function normalizeEntry(raw: unknown): VaultImportEntry {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid vault entry: expected object');
  }

  const entry = raw as Record<string, unknown>;
  const taskType = String(entry.task_type || '').trim();
  const version = String(entry.version || '').trim();
  const template = String(entry.template || '').trim();
  const tags = Array.isArray(entry.tags) ? entry.tags.map((tag) => String(tag)) : [];

  if (!taskType || !version || !template) {
    throw new Error('Invalid vault entry: task_type, version, and template are required');
  }

  return {
    id: entry.id ? String(entry.id).trim() : undefined,
    task_type: taskType,
    version,
    tags,
    template,
    pinned: Boolean(entry.pinned),
    score: typeof entry.score === 'number' ? entry.score : undefined,
  };
}

function deriveTitle(entry: VaultImportEntry): string {
  if (entry.id) {
    return entry.id;
  }
  return `${entry.task_type} ${entry.version}`.trim();
}

async function ensureImportColumns() {
  const db = await getDb();
  const columns = db.prepare('PRAGMA table_info(prompt_vault)').all() as Array<{ name?: unknown }>;
  const columnNames = new Set<string>();
  for (const row of columns) {
    if (typeof row.name === 'string') {
      columnNames.add(row.name);
    }
  }

  if (!columnNames.has('source_id')) {
    db.exec('ALTER TABLE prompt_vault ADD COLUMN source_id TEXT');
  }
  if (!columnNames.has('score')) {
    db.exec('ALTER TABLE prompt_vault ADD COLUMN score REAL');
  }
}

export async function importVaultFromFile(filePath: string): Promise<ImportResult> {
  const rawText = fs.readFileSync(filePath, 'utf-8');
  const rawJson = JSON.parse(rawText);
  if (!Array.isArray(rawJson)) {
    throw new Error('Vault import file must contain a JSON array');
  }

  await ensureImportColumns();
  const db = await getDb();

  let imported = 0;
  let skipped = 0;

  const importTransaction = db.transaction((entries: VaultImportEntry[]) => {
    const selectBySourceId = db.prepare('SELECT id FROM prompt_vault WHERE source_id = ?');
    const insertPrompt = db.prepare(
      `INSERT INTO prompt_vault (
         title,
         task_type,
         version,
         tags_json,
         template,
         pinned,
         use_count,
         last_used_at,
         source_id,
         score
       ) VALUES (?, ?, ?, ?, ?, ?, 0, NULL, ?, ?)`
    );

    for (const entry of entries) {
      if (entry.id) {
        const exists = selectBySourceId.get(entry.id);
        if (exists) {
          skipped += 1;
          continue;
        }
      }

      insertPrompt.run(
        deriveTitle(entry),
        entry.task_type,
        entry.version,
        JSON.stringify(entry.tags),
        entry.template,
        entry.pinned ? 1 : 0,
        entry.id || null,
        entry.score ?? null,
      );
      imported += 1;
    }
  });

  try {
    const normalizedEntries = rawJson.map((rawEntry) => normalizeEntry(rawEntry));
    importTransaction(normalizedEntries);
  } catch (error) {
    throw error;
  }

  return { imported, skipped };
}
