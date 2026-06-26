/**
 * Jcode Client — spawns `jcode run --ndjson` for each user message.
 * Replaces callLLM.ts + parseDSML.ts + runTool.ts with the real jcode binary.
 *
 * On Windows, jcode is typically at:
 *   %LOCALAPPDATA%\jcode\builds\stable\jcode.exe
 *
 * Session continuity via --resume:
 *   - First message:  jcode run --ndjson --model flash-k2 "message"
 *   - Next messages:  jcode --resume <session_id> run --ndjson --model flash-k2 "message"
 *   - The active session ID is extracted from the NDJSON start event.
 *   - --resume is a global flag (before the subcommand), not a subcommand flag.
 *
 * Cross-session memory:
 *   - When a session closes, a SessionSummary is written to ~/.jcode/prev_session.json
 *   - When a new session opens, the previous summary is loaded
 *   - The summary is injected into the system prompt for context continuity
 */

import { spawn, SpawnOptionsWithoutStdio } from 'child_process';
import * as path from 'path';
import { SessionSummary } from './session-summary';
import * as fs from 'fs';
import * as os from 'os';

// ── Types ───────────────────────────────────────────────────────────────────

export interface JcodeEvent {
  type: string;
  content?: string;
  tool?: string;
  input?: string;
  output?: string;
  message?: string;
  error?: string;
  session_id?: string;
  id?: string;
  name?: string;
  duration_ms?: number;
  text?: string;
}

export interface JcodeResult {
  success: boolean;
  content: string;
  toolCalls: number;
  sessionId?: string;
  error?: string;
}

// ── Find jcode binary ────────────────────────────────────────────────────────

function findJcodeExec(): string {
  const candidates = [
    path.join(os.homedir(), 'AppData', 'Local', 'jcode', 'builds', 'stable', 'jcode.exe'),
    path.join(os.homedir(), 'AppData', 'Local', 'jcode', 'bin', 'jcode.exe'),
    'jcode',
    'jcode.exe',
  ];

  for (const c of candidates) {
    try {
      if (!c.includes('\\') || fs.existsSync(c)) return c;
    } catch {}
  }
  return 'jcode.exe';
}

// ── Session state ────────────────────────────────────────────────────────────
// Track the active jcode session for --continue across messages.
let activeSessionId: string | null = null;
let activeCwd: string | null = null;

/**
 * Reset the active session (e.g. on errors or explicit reset).
 */
export function resetSession(): void {
  activeSessionId = null;
  activeCwd = null;
}

/**
 * Get the current session ID (if any).
 */
export function getActiveSessionId(): string | null {
  return activeSessionId;
}

/**
 * Build spawn args for jcode, adding --resume before the subcommand if a session exists.
 * On the first message (no active session), prepend repo context primer.
 *
 * jcode CLI: jcode [global-args] <subcommand> [subcommand-args]
 *   --resume is a global flag (before "run")
 *   --model  is a subcommand flag (after "run")
 */
function buildJcodeArgs(message: string, model: string): string[] {
  const args: string[] = [];

  // On first message, inject repo context primer so jcode knows the codebase
  if (!activeSessionId) {
    try {
      const { buildPrimer, refreshContext } = require('./repo-context');
      const cwd = activeCwd || process.cwd();
      const ctx = refreshContext(cwd);
      const primer = buildPrimer(ctx);
      const cappedPrimer = primer.length > 8000 ? primer.slice(0, 8000) + '\n... (truncated)' : primer;
      if (cappedPrimer) {
        message = `${cappedPrimer}\n\n${message}`;
      }
    } catch {
      // repo-context may not be available — proceed without primer
    }
  }

  // If we have an active session, resume it (global flag before subcommand)
  if (activeSessionId) {
    args.push('--resume', activeSessionId);
  }
  // Subcommand + flags
  args.push('run', '--ndjson', '--model', model);
  // Message is the last arg
  args.push(message);
  return args;
}

/**
 * Extract session_id from events and update activeSessionId.
 * Also saves a SessionSummary to disk for cross-session context.
 */
function updateSessionFromEvents(events: JcodeEvent[]): void {
  let sessionId: string | null = null;
  for (const evt of events) {
    if (evt.type === 'start' && evt.session_id) {
      sessionId = evt.session_id;
      activeSessionId = evt.session_id;
    }
  }

  // Save session summary for cross-session memory
  if (sessionId && events.length > 3) {
    try {
      const messageContents: string[] = [];
      const toolOutputs: string[] = [];
      let tokenCount = 0;

      for (const evt of events) {
        if (evt.type === 'token' || evt.type === 'text_delta') {
          const text = evt.content || evt.text || '';
          if (text) {
            messageContents.push(text.trim());
            tokenCount += text.length;
          }
        }
        if (evt.type === 'tool_done' && evt.output) {
          toolOutputs.push(evt.output);
        }
      }

      const summary = SessionSummary.build({
        sessionId,
        title: `jcode session ${sessionId.slice(0, 8)}`,
        messages: messageContents.map(content => ({ role: 'assistant', content })),
        toolOutputs,
        tokenCount,
      });
      summary.save();
    } catch {
      // Never block session close on summary I/O
    }
  }
}

// ── Run jcode with NDJSON streaming ──────────────────────────────────────────

/**
 * Execute a single message through the real jcode binary.
 * Returns an array of NDJSON events parsed from stdout.
 */
export function runJcode(
  message: string,
  options?: {
    provider?: string;
    model?: string;
    cwd?: string;
    timeout?: number;
  }
): Promise<JcodeEvent[]> {
  return new Promise((resolve, reject) => {
    const jcodePath = findJcodeExec();

    // jcode v0.31.2 uses config at ~/.jcode/config.toml
    // It already has [providers.greyos-local] with base_url = "http://127.0.0.1:4000/v1"
    // and default_model = "flash", default_provider = "greyos-local"
    const model = options?.model || process.env.KORE_AGENT_MODEL || 'flash-k2';

    // Update activeCwd if provided
    if (options?.cwd) activeCwd = options.cwd;

    const args: string[] = buildJcodeArgs(message, model);

    const opts: SpawnOptionsWithoutStdio = {
      cwd: activeCwd || options?.cwd || process.cwd(),
      timeout: options?.timeout || 120_000,
      windowsHide: true,
      env: {
        ...(process.env as any),
        GREYOS_LITELLM_KEY: process.env.GREYOS_LITELLM_KEY || process.env.LITELLM_API_KEY || 'sk-dyson',
      },
    };

    const proc = spawn(jcodePath, args, opts);
    const events: JcodeEvent[] = [];
    let buffer = '';
    let closed = false;

    if (proc.stdout) {
      proc.stdout.on('data', (chunk: Buffer) => {
        if (closed) return;
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            events.push(JSON.parse(line));
          } catch {
            buffer = line + '\n' + buffer;
          }
        }
      });
    }

    if (proc.stderr) {
      proc.stderr.on('data', (_chunk: Buffer) => {
        // silently consumed to avoid EPIPE
      });
    }

    proc.on('close', (_code: number | null) => {
      if (closed) return;
      closed = true;
      if (buffer.trim()) {
        try { events.push(JSON.parse(buffer)); } catch {}
      }
      // Track session_id for --continue on subsequent calls
      updateSessionFromEvents(events);
      resolve(events);
    });

    proc.on('error', (err: Error) => {
      if (closed) return;
      closed = true;
      reject(new Error(`jcode spawn failed: ${err.message}`));
    });
  });
}

/**
 * Execute jcode and stream each NDJSON event via a callback as it arrives.
 * Returns the child process so the caller can abort it (e.g. via .kill()).
 */
export function runJcodeStreaming(
  message: string,
  onEvent: (event: JcodeEvent) => void,
  options?: {
    provider?: string;
    model?: string;
    cwd?: string;
    timeout?: number;
  }
): import('child_process').ChildProcess {
  const jcodePath = findJcodeExec();

  const model = options?.model || process.env.KORE_AGENT_MODEL || 'flash-k2';

  // Update activeCwd if provided
  if (options?.cwd) activeCwd = options.cwd;

  const args: string[] = buildJcodeArgs(message, model);

  const opts: SpawnOptionsWithoutStdio = {
    cwd: activeCwd || options?.cwd || process.cwd(),
    timeout: options?.timeout || 120_000,
    windowsHide: true,
    env: {
      ...(process.env as any),
      GREYOS_LITELLM_KEY: process.env.GREYOS_LITELLM_KEY || process.env.LITELLM_API_KEY || 'sk-dyson',
    },
  };

  const proc = spawn(jcodePath, args, opts);
  // Collect events to track session_id (for --continue)
  const events: JcodeEvent[] = [];
  let closed = false;
  let buffer = '';

  if (proc.stdout) {
    proc.stdout.on('data', (chunk: Buffer) => {
      if (closed) return;
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line) as JcodeEvent;
          events.push(parsed);
          onEvent(parsed);
        } catch {
          buffer = line + '\n' + buffer;
        }
      }
    });
  }

  if (proc.stderr) {
    proc.stderr.on('data', (_chunk: Buffer) => {
      // silently consumed to avoid EPIPE
    });
  }

  proc.on('error', (err: Error) => {
    if (closed) return;
    closed = true;
    onEvent({ type: 'error', message: `jcode spawn failed: ${err.message}` });
  });

  proc.on('close', () => {
    if (closed) return;
    closed = true;
    // Track session_id for --continue on subsequent calls
    updateSessionFromEvents(events);
  });

  return proc;
}

/**
 * Convenience: run a message through jcode and extract the final text response.
 */
export async function jcodeChat(
  message: string,
  options?: { provider?: string; model?: string; cwd?: string }
): Promise<JcodeResult> {
  try {
    const events = await runJcode(message, options);
    let content = '';
    let sessionId: string | undefined;
    let toolCalls = 0;

    for (const event of events) {
      switch (event.type) {
        case 'token':
          content += event.content || '';
          break;
        case 'tool_use':
          toolCalls++;
          break;
        case 'start':
          sessionId = event.session_id;
          break;
        case 'error':
          return { success: false, content, toolCalls, sessionId, error: event.message };
      }
    }

    return { success: true, content, toolCalls, sessionId };
  } catch (e) {
    return { success: false, content: '', toolCalls: 0, error: (e as Error).message };
  }
}
