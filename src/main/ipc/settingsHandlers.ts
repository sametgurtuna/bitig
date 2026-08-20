import fs from 'node:fs';
import path from 'node:path';
import { BrowserWindow, dialog, ipcMain } from 'electron';
import { SETTINGS_CHANNELS } from '../../shared/settingsTypes';
import type { BitigSettingsPatch } from '../../shared/settingsTypes';
import type { SettingsStore } from '../settings/settingsStore';

const MIME_BY_EXTENSION: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml'
};

/**
 * settings:* IPC kanallarini SettingsStore'a baglar.
 *
 * settings:read-background-image, renderer'a dogrudan dosya yolu ya da
 * `file://` erisimi vermek yerine gorseli main'de okuyup base64 `data:`
 * URL'i olarak dondurur - boylece CSP'yi `file:`e acmamiza gerek kalmaz ve
 * renderer hicbir zaman keyfi bir dosya yoluna erismez.
 */
export function registerSettingsHandlers(settingsStore: SettingsStore): void {
  ipcMain.handle(SETTINGS_CHANNELS.get, () => settingsStore.get());

  ipcMain.on(SETTINGS_CHANNELS.set, (_event, patch: BitigSettingsPatch) => {
    settingsStore.update(patch);
  });

  ipcMain.on(SETTINGS_CHANNELS.reset, () => {
    settingsStore.reset();
  });

  ipcMain.handle(SETTINGS_CHANNELS.pickBackgroundImage, async (event) => {
    const parent = BrowserWindow.fromWebContents(event.sender);
    const dialogOptions = {
      title: 'Arkaplan gorseli sec',
      properties: ['openFile' as const],
      filters: [
        { name: 'Gorseller', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'] }
      ]
    };
    const result = parent
      ? await dialog.showOpenDialog(parent, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions);
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle(SETTINGS_CHANNELS.readBackgroundImage, () => {
    const imagePath = settingsStore.get().appearance.backgroundImage;
    if (!imagePath) return null;

    const extension = path.extname(imagePath).toLowerCase();
    const mime = MIME_BY_EXTENSION[extension];
    if (!mime) {
      console.error(`[Bitig] Desteklenmeyen arkaplan gorseli uzantisi: ${extension}`);
      return null;
    }

    try {
      const buffer = fs.readFileSync(imagePath);
      return `data:${mime};base64,${buffer.toString('base64')}`;
    } catch (error) {
      console.error(`[Bitig] Arkaplan gorseli okunamadi (${imagePath}): ${String(error)}`);
      return null;
    }
  });

  settingsStore.onChange((settings) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.isDestroyed() || win.webContents.isDestroyed()) continue;
      try {
        win.webContents.send(SETTINGS_CHANNELS.changed, settings);
      } catch {
        // Pencere kapaniyorsa sessizce gec
      }
    }
  });
}
