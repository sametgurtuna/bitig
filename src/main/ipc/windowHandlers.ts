import { ipcMain, Notification, type BrowserWindow } from 'electron';
import { WINDOW_CHANNELS, type WindowNotifyPayload } from '../../shared/windowTypes';

/**
 * window:* IPC kanallarini BrowserWindow'a baglar. Ozel title bar'daki
 * minimize/maximize/close butonlari ve yerel bildirimler bu kanallar uzerinden calisir.
 */
export function registerWindowHandlers(win: BrowserWindow): void {
  ipcMain.on(WINDOW_CHANNELS.minimize, () => win.minimize());

  ipcMain.on(WINDOW_CHANNELS.toggleMaximize, () => {
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });

  ipcMain.on(WINDOW_CHANNELS.close, () => win.close());

  ipcMain.handle(WINDOW_CHANNELS.isMaximized, () => win.isMaximized());

  // Yerel Windows masaustu bildirimi gonder
  ipcMain.on(WINDOW_CHANNELS.notify, (_event, payload: WindowNotifyPayload) => {
    if (Notification.isSupported()) {
      const notification = new Notification({
        title: payload.title,
        body: payload.body,
        silent: false
      });
      notification.on('click', () => {
        if (win.isMinimized()) win.restore();
        win.focus();
      });
      notification.show();
    }
  });

  // Maximize durumu kullanici cift-tiklama ya da OS kisayoluyla da degisebilir;
  // renderer'daki buton ikonunu guncel tutmak icin degisikligi push ediyoruz.
  const notifyMaximizeChange = (): void => {
    if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
      try {
        win.webContents.send(WINDOW_CHANNELS.maximizeChange, { isMaximized: win.isMaximized() });
      } catch {
        // Pencere kapaniyorsa sessizce gec
      }
    }
  };
  win.on('maximize', notifyMaximizeChange);
  win.on('unmaximize', notifyMaximizeChange);
}
