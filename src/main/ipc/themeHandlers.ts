import { ipcMain, type WebContents } from 'electron';
import { THEME_CHANNELS } from '../../shared/themeTypes';
import type { ThemeStore } from '../theme/themeStore';

/** theme:* IPC kanallarini ThemeStore'a baglar. */
export function registerThemeHandlers(themeStore: ThemeStore, webContents: WebContents): void {
  ipcMain.handle(THEME_CHANNELS.list, () => themeStore.list());

  themeStore.onListChanged(() => {
    webContents.send(THEME_CHANNELS.listChanged);
  });
}
