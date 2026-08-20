import os from 'node:os';
import { randomUUID } from 'node:crypto';
import * as pty from 'node-pty';
import type { IPty } from 'node-pty';
import { applyShellIntegration } from './shellIntegration';

interface PtySession {
  process: IPty;
  /** Bu oturumu acan pencerenin webContents.id'si; pencere kapaninca
   *  yalnizca o pencereye ait PTY'ler oldurulur (coklu pencere destegi). */
  ownerId: number;
}

export interface PtyCreateArgs {
  cols: number;
  rows: number;
  command?: string;
  args?: string[];
  cwd?: string;
  ownerId: number;
  /** Kabuk entegrasyonu (OSC 7 ile canli CWD yayini) enjekte edilsin mi? */
  shellIntegration?: boolean;
}

/**
 * Aktif PTY (proses) instance'larini id -> IPty eslemesiyle tutan yonetici.
 * Her sekme/pane bir PTY'ye karsilik gelir; her oturum onu acan pencereye
 * (ownerId) baglidir.
 */
export class PtyManager {
  private readonly sessions = new Map<string, PtySession>();

  create(options: PtyCreateArgs): string {
    const id = randomUUID();
    const shell = options.command && options.command.trim() !== '' ? options.command : this.resolveShell();
    const spawnArgs = Array.isArray(options.args) ? options.args : [];
    const resolvedCwd = this.resolveCwd(options.cwd);
    const baseEnv = process.env as Record<string, string>;

    const integrated =
      options.shellIntegration === false
        ? { args: spawnArgs, env: baseEnv }
        : applyShellIntegration(shell, spawnArgs, baseEnv);

    const shellProcess = pty.spawn(shell, integrated.args, {
      name: 'xterm-256color',
      cols: options.cols,
      rows: options.rows,
      cwd: resolvedCwd,
      env: integrated.env
    });

    this.sessions.set(id, { process: shellProcess, ownerId: options.ownerId });
    return id;
  }

  onData(id: string, listener: (data: string) => void): void {
    this.sessions.get(id)?.process.onData(listener);
  }

  onExit(id: string, listener: (exitCode: number) => void): void {
    this.sessions.get(id)?.process.onExit(({ exitCode }) => listener(exitCode));
  }

  write(id: string, data: string): void {
    this.sessions.get(id)?.process.write(data);
  }

  resize(id: string, cols: number, rows: number): void {
    // Boyutlar 0 veya negatif olamaz; ConPTY bu durumda hata firlatir.
    if (cols <= 0 || rows <= 0) return;
    this.sessions.get(id)?.process.resize(cols, rows);
  }

  dispose(id: string): void {
    const session = this.sessions.get(id);
    if (session) {
      try {
        session.process.kill();
      } catch {
        // Proses zaten sonlanmissa sessizce gec
      }
      this.sessions.delete(id);
    }
  }

  /** Belirtilen pencereye ait tum PTY'leri sonlandirir. */
  disposeByOwner(ownerId: number): void {
    for (const [id, session] of Array.from(this.sessions.entries())) {
      if (session.ownerId === ownerId) this.dispose(id);
    }
  }

  disposeAll(): void {
    const ids = Array.from(this.sessions.keys());
    for (const id of ids) {
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
