import { ipcMain } from 'electron';
import { PTY_CHANNELS } from '../../shared/ptyTypes';
import type {
  PtyCreateOptions,
  PtyCreateResult,
  PtyDisposePayload,
  PtyResizePayload,
  PtyWritePayload
} from '../../shared/ptyTypes';
import type { PtyManager } from '../pty/ptyManager';
import type { SettingsStore } from '../settings/settingsStore';

/**
 * pty:* IPC kanallarini PtyManager'a baglar. Renderer -> main yonundeki
 * cagrilari dinler ve main -> renderer yonunde pty:data / pty:exit event'lerini gonderir.
 *
 * Handler'lar uygulama basina bir kez kaydedilir; hedef pencere her cagrida
 * `event.sender` uzerinden cozulur. Boylece birden fazla ana pencere ayni
 * kanallari paylasabilir (bkz. CLAUDE.md "Coklu Pencere").
 */
export function registerPtyHandlers(ptyManager: PtyManager, settingsStore: SettingsStore): void {
  ipcMain.handle(PTY_CHANNELS.create, (event, options: PtyCreateOptions): PtyCreateResult => {
    const sender = event.sender;
    const id = ptyManager.create({
      cols: options.cols,
      rows: options.rows,
      command: options.command,
      args: options.args,
      cwd: options.cwd,
      ownerId: sender.id,
      shellIntegration: settingsStore.get().terminal.shellIntegration !== false
    });

    ptyManager.onData(id, (data) => {
      if (!sender.isDestroyed()) {
        try {
          sender.send(PTY_CHANNELS.data, { id, data });
        } catch {
          // Pencere kapaniyorsa veya nesne yok edildiyse sessizce gec
        }
      }
    });
    ptyManager.onExit(id, (exitCode) => {
      if (!sender.isDestroyed()) {
        try {
          sender.send(PTY_CHANNELS.exit, { id, exitCode });
        } catch {
          // Pencere kapaniyorsa veya nesne yok edildiyse sessizce gec
        }
      }
    });

    return { id };
  });

  ipcMain.on(PTY_CHANNELS.write, (_event, payload: PtyWritePayload) => {
    ptyManager.write(payload.id, payload.data);
  });

  ipcMain.on(PTY_CHANNELS.resize, (_event, payload: PtyResizePayload) => {
    ptyManager.resize(payload.id, payload.cols, payload.rows);
  });

  ipcMain.on(PTY_CHANNELS.dispose, (_event, payload: PtyDisposePayload) => {
    ptyManager.dispose(payload.id);
  });
}
