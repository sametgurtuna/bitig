import type { BitigSettings } from '../../shared/settingsTypes';

interface PendingCommand {
  command: string;
  startTime: number;
  timerId?: any;
}

/**
 * Komut sure telemetrisi ve arka plan bildirim kontrolcusu.
 * Komutlarin calisma surelerini olcer, gecmise kaydeder ve esik degerini
 * asan uzun gorevler tamamlandiginda Windows bildirimi gonderir.
 */
export class ExecutionTelemetry {
  private settings: BitigSettings | null = null;
  private pendingCommands = new Map<string, PendingCommand>();
  private inputBuffers = new Map<string, string>();

  constructor() {
    void window.bitig.settings.get().then((s) => {
      this.settings = s;
    });

    window.bitig.settings.onChanged((s) => {
      this.settings = s;
    });
  }

  /**
   * Terminale gonderilen karakterleri izler ve Enter'da komutu kaydeder.
   */
  handleTerminalInput(paneId: string, data: string): void {
    if (!this.inputBuffers.has(paneId)) {
      this.inputBuffers.set(paneId, '');
    }

    if (data === '\r' || data === '\n') {
      const buffer = this.inputBuffers.get(paneId) || '';
      const trimmed = buffer.trim();
      if (trimmed) {
        this.startCommand(paneId, trimmed);
      }
      this.inputBuffers.set(paneId, '');
    } else if (data === '\x7f' || data === '\b') {
      // Backspace
      const curr = this.inputBuffers.get(paneId) || '';
      this.inputBuffers.set(paneId, curr.slice(0, -1));
    } else if (data.length === 1 && data.charCodeAt(0) >= 32) {
      const curr = this.inputBuffers.get(paneId) || '';
      this.inputBuffers.set(paneId, curr + data);
    }
  }

  /**
   * Programatik olarak bir komut calistirildiginda (Betik, Gecmis, Palet) baslatir.
   */
  startCommand(paneId: string, command: string): void {
    const trimmed = command.trim();
    if (!trimmed) return;

    // Onceki yarim kalan komut varsa bitir
    if (this.pendingCommands.has(paneId)) {
      this.finishCommand(paneId);
    }

    this.pendingCommands.set(paneId, {
      command: trimmed,
      startTime: Date.now()
    });
  }

  /**
   * PTY ciktisi geldiginde veya proses sonlandiginda komutun bittigini tespit eder.
   */
  handleTerminalOutput(paneId: string, _data: string): void {
    const pending = this.pendingCommands.get(paneId);
    if (!pending) return;

    // Cikti akisi duruldugunda (debounce) komutun tamamlandigini varsay
    if (pending.timerId) {
      clearTimeout(pending.timerId);
    }

    pending.timerId = setTimeout(() => {
      this.finishCommand(paneId);
    }, 600);
  }

  finishCommand(paneId: string, exitCode?: number): void {
    const pending = this.pendingCommands.get(paneId);
    if (!pending) return;

    this.pendingCommands.delete(paneId);
    if (pending.timerId) {
      clearTimeout(pending.timerId);
    }

    const durationMs = Date.now() - pending.startTime;
    const cmd = pending.command;

    // Gecmise kaydet
    void window.bitig.history.add({
      command: cmd,
      durationMs,
      exitCode
    });

    // Bildirim kontrolu
    const telemetrySettings = this.settings?.telemetry;
    const enableNotifications = telemetrySettings?.enableNotifications ?? true;
    const thresholdMs = telemetrySettings?.notificationThresholdMs ?? 5000;

    if (enableNotifications && durationMs >= thresholdMs) {
      // Pencere odakta degilse veya arka plandaysa bildirim gonder
      const isBackground = document.hidden || !document.hasFocus();
      if (isBackground) {
        const sec = (durationMs / 1000).toFixed(1);
        window.bitig.windowControls.notify({
          title: '✅ Command Finished',
          body: `"${cmd.length > 40 ? cmd.slice(0, 37) + '...' : cmd}" (${sec}s)`
        });
      }
    }
  }
}
