import { ipcMain, BrowserWindow } from 'electron';
import { THEME_CHANNELS } from '../../shared/themeTypes';
import type { ThemeStore } from '../theme/themeStore';

/**
 * theme:* IPC kanallarini ThemeStore'a baglar. Uygulama basina bir kez
 * kaydedilir; tema listesi degisince acik olan tum pencerelere yayin yapar.
 */
export function registerThemeHandlers(themeStore: ThemeStore): void {
  ipcMain.handle(THEME_CHANNELS.list, () => themeStore.list());

  themeStore.onListChanged(() => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.isDestroyed() || win.webContents.isDestroyed()) continue;
      try {
        win.webContents.send(THEME_CHANNELS.listChanged);
      } catch {
        // Pencere kapaniyorsa sessizce gec
      }
    }
  });
}
