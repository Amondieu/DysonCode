import { EventEmitter } from 'events';
import path from 'path';
import os from 'os';

// Lazy-load node-pty with workaround for Electron/Windows AttachConsole bug
let ptyModule: typeof import('node-pty') | null = null;
let ptyLoadError: Error | null = null;

function getPtyModule(): typeof import('node-pty') {
  if (!ptyModule && !ptyLoadError) {
    try {
      // Patch: node-pty's conpty_console_list_agent tries AttachConsole
      // which fails inside Electron. Setting an env var can prevent
      // some node-pty preflight checks from running.
      process.env.NODE_PTY_FORWARD_CONSOLE = '0';
      ptyModule = require('node-pty');
    } catch (e: any) {
      ptyLoadError = e;
      console.warn('[DysonCode] node-pty failed to load, terminal will be disabled:', e.message);
    }
  }
  if (!ptyModule) {
    throw ptyLoadError || new Error('node-pty not available');
  }
  return ptyModule;
}

export interface TerminalSession {
  id: string;
  pty: import('node-pty').IPty;
  title: string;
}

export class TerminalManager extends EventEmitter {
  private terminals: Map<string, TerminalSession> = new Map();
  private activeId: string | null = null;
  private counter = 0;

  create(title?: string): TerminalSession {
    const nodePty = getPtyModule();
    this.counter++;
    const id = `term-${this.counter}`;

    const shell = os.platform() === 'win32' ? 'powershell.exe' : (process.env.SHELL || '/bin/bash');
    const shellArgs = os.platform() === 'win32' ? [] : [];

    const pty = nodePty.spawn(shell, shellArgs, {
      name: 'xterm-256color',
      cols: 120,
      rows: 30,
      cwd: process.cwd(),
      env: { ...process.env, TERM: 'xterm-256color' },
    });

    const session: TerminalSession = {
      id,
      pty,
      title: title || `Terminal ${this.counter}`,
    };

    pty.onData((data: string) => {
      this.emit('data', { id, data });
    });

    pty.onExit(({ exitCode }: { exitCode: number }) => {
      this.emit('exit', { id, exitCode });
      this.terminals.delete(id);
      if (this.activeId === id) {
        this.activeId = null;
      }
    });

    this.terminals.set(id, session);
    if (!this.activeId) {
      this.activeId = id;
    }

    return session;
  }

  write(id: string, data: string) {
    const session = this.terminals.get(id);
    if (session) {
      session.pty.write(data);
    }
  }

  resize(id: string, cols: number, rows: number) {
    const session = this.terminals.get(id);
    if (session) {
      session.pty.resize(cols, rows);
    }
  }

  kill(id: string) {
    const session = this.terminals.get(id);
    if (session) {
      session.pty.kill();
      this.terminals.delete(id);
      if (this.activeId === id) {
        this.activeId = null;
      }
    }
  }

  setActive(id: string) {
    this.activeId = id;
  }

  getActive(): TerminalSession | undefined {
    return this.activeId ? this.terminals.get(this.activeId) : undefined;
  }

  list(): TerminalSession[] {
    return Array.from(this.terminals.values());
  }

  killAll() {
    for (const [, session] of this.terminals) {
      session.pty.kill();
    }
    this.terminals.clear();
    this.activeId = null;
  }
}

export const terminalManager = new TerminalManager();
