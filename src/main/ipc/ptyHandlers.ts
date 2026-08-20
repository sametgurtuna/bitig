import { ipcMain, type WebContents } from 'electron';
import { PTY_CHANNELS } from '../../shared/ptyTypes';
import type {
  PtyCreateOptions,
  PtyCreateResult,
  PtyDisposePayload,
  PtyResizePayload,
  PtyWritePayload
} from '../../shared/ptyTypes';
import type { PtyManager } from '../pty/ptyManager';

/**
 * pty:* IPC kanallarini PtyManager'a baglar. Renderer -> main yonundeki
 * cagrilari dinler ve main -> renderer yonunde pty:data / pty:exit event'lerini gonderir.
 */
export function registerPtyHandlers(ptyManager: PtyManager, webContents: WebContents): void {
  ipcMain.handle(PTY_CHANNELS.create, (_event, options: PtyCreateOptions): PtyCreateResult => {
    const id = ptyManager.create(options.cols, options.rows, options.command, options.args, options.cwd);

    ptyManager.onData(id, (data) => {
      if (!webContents.isDestroyed()) {
        try {
          webContents.send(PTY_CHANNELS.data, { id, data });
        } catch {
          // Pencere kapaniyorsa veya nesne yok edildiyse sessizce gec
        }
      }
    });
    ptyManager.onExit(id, (exitCode) => {
      if (!webContents.isDestroyed()) {
        try {
          webContents.send(PTY_CHANNELS.exit, { id, exitCode });
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
