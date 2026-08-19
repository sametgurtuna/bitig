import os from 'node:os';
import { randomUUID } from 'node:crypto';
import * as pty from 'node-pty';
import type { IPty } from 'node-pty';

/**
 * Aktif PTY (proses) instance'larini id -> IPty eslemesiyle tutan yonetici.
 * Her sekme/pane bir PTY'ye karsilik gelir (ileride cogul sekme destegi icin hazir).
 */
export class PtyManager {
  private readonly sessions = new Map<string, IPty>();

  create(cols: number, rows: number, command?: string, args?: string[], cwd?: string): string {
    const id = randomUUID();
    const shell = command && command.trim() !== '' ? command : this.resolveShell();
    const spawnArgs = Array.isArray(args) ? args : [];
    const resolvedCwd = this.resolveCwd(cwd);

    const shellProcess = pty.spawn(shell, spawnArgs, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: resolvedCwd,
      env: process.env as Record<string, string>
    });

    this.sessions.set(id, shellProcess);
    return id;
  }

  onData(id: string, listener: (data: string) => void): void {
    this.sessions.get(id)?.onData(listener);
  }

  onExit(id: string, listener: (exitCode: number) => void): void {
    this.sessions.get(id)?.onExit(({ exitCode }) => listener(exitCode));
  }

  write(id: string, data: string): void {
    this.sessions.get(id)?.write(data);
  }

  resize(id: string, cols: number, rows: number): void {
    // Boyutlar 0 veya negatif olamaz; ConPTY bu durumda hata firlatir.
    if (cols <= 0 || rows <= 0) return;
    this.sessions.get(id)?.resize(cols, rows);
  }

  dispose(id: string): void {
    this.sessions.get(id)?.kill();
    this.sessions.delete(id);
  }

  disposeAll(): void {
    for (const id of this.sessions.keys()) {
      this.dispose(id);
    }
  }

  private resolveShell(): string {
    return 'powershell.exe';
  }

  private resolveCwd(cwd?: string): string {
    if (!cwd || cwd.trim() === '') return os.homedir();
    if (cwd === '~' || cwd === '%USERPROFILE%') return os.homedir();
    let expanded = cwd.replace(/%([^%]+)%/g, (_, n) => process.env[n] || '');
    return expanded || os.homedir();
  }
}
