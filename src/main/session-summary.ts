/**
 * SessionSummary — cross-session context bridge for jcode.
 *
 * Written when a jcode session closes (mark_closed equivalent).
 * Read when the next session opens (build_session_context equivalent).
 *
 * Persisted at ~/.jcode/prev_session.json
 * Injected into the next session's system prompt as a context section.
 *
 * P1.1: Compression quality gate — verifyCompression + compressWithGate
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ── Types ───────────────────────────────────────────────────────────────────

export interface SessionSummaryData {
  session_id: string;
  title: string | null;
  closed_at: string;
  key_decisions: string[];
  files_modified: string[];
  final_goal: string | null;
  token_count: number;
}

// ── Path ─────────────────────────────────────────────────────────────────────

function summaryPath(): string {
  return path.join(os.homedir(), '.jcode', 'prev_session.json');
}

// ── Class ────────────────────────────────────────────────────────────────────

export class SessionSummary {
  private data: SessionSummaryData;

  constructor(data: SessionSummaryData) {
    this.data = data;
  }

  /** Save this summary to disk, replacing the previous one. */
  save(): void {
    try {
      const p = summaryPath();
      const dir = path.dirname(p);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(p, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch {
      // Never block on summary I/O
    }
  }

  /** Load the most recent summary from disk, if it exists. */
  static load(): SessionSummary | null {
    try {
      const p = summaryPath();
      if (!fs.existsSync(p)) return null;
      const raw = fs.readFileSync(p, 'utf-8');
      const data = JSON.parse(raw) as SessionSummaryData;
      return new SessionSummary(data);
    } catch {
      return null;
    }
  }

  /** Format the summary as a compact markdown section for prompt injection. */
  asContextSection(): string {
    const d = this.data;
    let out = '## Previous Session Context\n\n';

    if (d.title) {
      out += `**Session:** ${d.title}\n`;
    }
    out += `**Closed:** ${d.closed_at}\n\n`;

    if (d.final_goal) {
      out += `**Last task:** ${d.final_goal}\n\n`;
    }

    if (d.key_decisions.length > 0) {
      out += '**Key decisions made:**\n';
      for (const dec of d.key_decisions) {
        out += `- ${dec}\n`;
      }
      out += '\n';
    }

    if (d.files_modified.length > 0) {
      out += '**Files modified:**\n';
      for (const f of d.files_modified) {
        out += `- \`${f}\`\n`;
      }
      out += '\n';
    }

    return out;
  }

  /** Get the raw data (for IPC to renderer). */
  getData(): SessionSummaryData {
    return { ...this.data };
  }

  // ── Static factory ─────────────────────────────────────────────────────────

  /**
   * Build a summary from collected message contents and tool outputs.
   * Call this when a session closes.
   */
  static build(params: {
    sessionId: string;
    title?: string | null;
    messages: { role: string; content: string }[];
    toolOutputs: string[];
    tokenCount: number;
  }): SessionSummary {
    const messageTexts = params.messages
      .filter(m => m.role === 'assistant' || m.role === 'user')
      .map(m => m.content);

    const toolTexts = params.toolOutputs;

    // Extract final user goal (last user message)
    const finalGoal = [...params.messages]
      .reverse()
      .find(m => m.role === 'user')
      ?.content ?? null;

    return new SessionSummary({
      session_id: params.sessionId,
      title: params.title ?? null,
      closed_at: new Date().toISOString(),
      key_decisions: SessionSummary.extractDecisions(messageTexts),
      files_modified: SessionSummary.extractFilePaths(toolTexts),
      final_goal: finalGoal,
      token_count: params.tokenCount,
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /**
   * Extract key decisions from message contents.
   * Looks for lines containing decision markers.
   */
  private static extractDecisions(messages: string[]): string[] {
    const markers = [
      'decided', 'chose', 'fixed', 'set to', 'changed',
      'added', 'removed', 'implemented', 'refactored',
    ];
    const decisions: string[] = [];

    for (const msg of messages) {
      for (const line of msg.split('\n')) {
        const lower = line.toLowerCase();
        const hasMarker = markers.some(m => lower.includes(m));
        if (hasMarker && line.length > 20) {
          const clean = line.trim()
            .replace(/^[-*]\s*/, '')
            .trim();
          if (clean && !decisions.includes(clean)) {
            decisions.push(clean);
            if (decisions.length >= 8) break;
          }
        }
      }
      if (decisions.length >= 8) break;
    }

    return decisions;
  }

  /**
   * Extract modified file paths from tool outputs.
   */
  private static extractFilePaths(outputs: string[]): string[] {
    const extensions = ['.rs', '.ts', '.py', '.js', '.toml', '.json', '.md', '.tsx', '.css'];
    const paths: string[] = [];

    for (const output of outputs) {
      for (const word of output.split(/\s+/)) {
        const hasExt = extensions.some(ext => word.endsWith(ext));
        if (hasExt) {
          const clean = word.replace(/[^a-zA-Z0-9_./\\-]/g, '');
          if (clean.length > 4 && !paths.includes(clean)) {
            paths.push(clean);
            if (paths.length >= 12) break;
          }
        }
      }
    }

    return paths;
  }
}

// ── Compression Quality Gate (P1.1, BS1) ─────────────────────────────────────

const DECISION_MARKERS = [
  'decided', 'chose', 'fixed', 'set to', 'changed',
  'added', 'removed', 'implemented', 'refactored', 'switched',
];

/**
 * Verify that all key decisions from the original messages
 * appear in the compressed output. Returns missing decisions.
 */
export function verifyCompression(
  original: string[],
  compressed: string
): string[] {
  const originalDecisions: string[] = [];
  for (const msg of original) {
    for (const line of msg.split('\n')) {
      const lower = line.toLowerCase();
      if (DECISION_MARKERS.some(m => lower.includes(m)) && line.length > 20) {
        originalDecisions.push(line.trim().slice(0, 80));
      }
    }
  }

  if (originalDecisions.length === 0) return [];

  const compressedLower = compressed.toLowerCase();
  return originalDecisions.filter(d => {
    const snippet = d.toLowerCase().slice(0, 30).trim();
    return snippet.length > 10 && !compressedLower.includes(snippet);
  });
}

/**
 * Compress episodic buffer with a quality gate.
 * If key decisions are missing, retry once with must_preserve list.
 * Uses LiteLLM proxy on :4000.
 */
export async function compressWithGate(
  messages: string[],
  targetTokens: number
): Promise<string> {
  const buildPrompt = (mustPreserve: string[] = []) => {
    const preserve = mustPreserve.length > 0
      ? `\n\nYOU MUST PRESERVE THESE VERBATIM:\n${mustPreserve.map(d => `- ${d}`).join('\n')}`
      : '';
    return `Compress the following conversation to under ${targetTokens} tokens.
PRESERVE: all decisions made, values computed, errors found, file paths modified.
DROP: reasoning chains, repeated context, intermediate steps that led nowhere.
CRITICAL: preserve all error codes and stack traces verbatim.${preserve}

CONVERSATION:
${messages.join('\n---\n')}

COMPRESSED OUTPUT:`;
  };

  // First attempt
  const first = await callLiteLLM('flash', buildPrompt(), targetTokens * 4);
  const missing = verifyCompression(messages, first);

  if (missing.length === 0) return first;

  // One retry with explicit must-preserve list
  console.log(`[compression-gate] Retrying — ${missing.length} decisions missing`);
  const second = await callLiteLLM('flash', buildPrompt(missing.slice(0, 5)), targetTokens * 4);
  return second;
}

async function callLiteLLM(model: string, prompt: string, maxTokens: number): Promise<string> {
  try {
    const res = await fetch('http://localhost:4000/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: maxTokens,
        temperature: 0.1,
      }),
    });
    const data = await res.json() as any;
    return data.choices?.[0]?.message?.content ?? '';
  } catch {
    return ''; // fail open — caller should handle empty string
  }
}
