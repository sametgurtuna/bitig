import { ipcMain, BrowserWindow, Notification } from 'electron';
import { WINDOW_CHANNELS, type WindowNotifyPayload } from '../../shared/windowTypes';

/**
 * window:* IPC kanallari.
 *
 * Handler'lar uygulama basina bir kez kaydedilir ve hedef pencereyi her
 * cagrida `event.sender` uzerinden cozer - boylece ayni kanallar birden fazla
 * ana pencere tarafindan paylasilabilir. Pencereye ozel olan tek is
 * maximize/unmaximize aboneligidir; o da `attachWindowEvents` ile her pencere
 * icin ayrica kurulur.
 */
export function registerWindowHandlers(onNewWindowRequested: () => void): void {
  const senderWindow = (event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent): BrowserWindow | null =>
    BrowserWindow.fromWebContents(event.sender);

  ipcMain.on(WINDOW_CHANNELS.minimize, (event) => senderWindow(event)?.minimize());

  ipcMain.on(WINDOW_CHANNELS.toggleMaximize, (event) => {
    const win = senderWindow(event);
    if (!win) return;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });

  ipcMain.on(WINDOW_CHANNELS.close, (event) => senderWindow(event)?.close());

  ipcMain.handle(WINDOW_CHANNELS.isMaximized, (event) => senderWindow(event)?.isMaximized() ?? false);

  ipcMain.on(WINDOW_CHANNELS.newWindow, () => onNewWindowRequested());

  // Yerel Windows masaustu bildirimi gonder
  ipcMain.on(WINDOW_CHANNELS.notify, (event, payload: WindowNotifyPayload) => {
    if (!Notification.isSupported()) return;
    const win = senderWindow(event);
    const notification = new Notification({
      title: payload.title,
      body: payload.body,
      silent: false
    });
    notification.on('click', () => {
      if (!win || win.isDestroyed()) return;
      if (win.isMinimized()) win.restore();
      win.focus();
    });
    notification.show();
  });
}

/**
 * Maximize durumu kullanici cift-tiklama ya da OS kisayoluyla da degisebilir;
 * renderer'daki buton ikonunu guncel tutmak icin degisikligi push ediyoruz.
 * Bu abonelik pencereye ozel oldugu icin her pencere olusturuldugunda cagrilir.
 */
export function attachWindowEvents(win: BrowserWindow): void {
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
