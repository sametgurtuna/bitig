import { ipcMain, type BrowserWindow } from 'electron';
import { WINDOW_CHANNELS } from '../../shared/windowTypes';

/**
 * window:* IPC kanallarini BrowserWindow'a baglar. Ozel title bar'daki
 * minimize/maximize/close butonlari bu kanallar uzerinden calisir.
 */
export function registerWindowHandlers(win: BrowserWindow): void {
  ipcMain.on(WINDOW_CHANNELS.minimize, () => win.minimize());

  ipcMain.on(WINDOW_CHANNELS.toggleMaximize, () => {
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });

  ipcMain.on(WINDOW_CHANNELS.close, () => win.close());

  ipcMain.handle(WINDOW_CHANNELS.isMaximized, () => win.isMaximized());

  // Maximize durumu kullanici cift-tiklama ya da OS kisayoluyla da degisebilir;
  // renderer'daki buton ikonunu guncel tutmak icin degisikligi push ediyoruz.
  const notifyMaximizeChange = (): void => {
    win.webContents.send(WINDOW_CHANNELS.maximizeChange, { isMaximized: win.isMaximized() });
  };
  win.on('maximize', notifyMaximizeChange);
  win.on('unmaximize', notifyMaximizeChange);
}
