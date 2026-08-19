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

  create(cols: number, rows: number): string {
    const id = randomUUID();
    const shell = this.resolveShell();

    const shellProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: os.homedir(),
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
    // Prototip icin sabit: Windows PowerShell. Ileride ayarlardan (varsa pwsh,
    // WSL, cmd) secilebilir hale getirilecek (bkz. CLAUDE.md yol haritasi).
    return 'powershell.exe';
  }
}
