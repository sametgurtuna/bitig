import { ipcMain, globalShortcut, BrowserWindow, screen } from 'electron';
import { join } from 'node:path';
import { QUAKE_CHANNELS, type QuakeSettings, DEFAULT_QUAKE_SETTINGS } from '../../shared/quakeTypes';

/**
 * Quake / Dropdown HUD penceresi ve global kisayol yoneticisi.
 *
 * - quake:toggle    -> IPC'den el ile tetiklenir
 * - quake:set-hotkey -> globalShortcut'i yeniden kaydeder
 *
 * Pencere ana pencereden ayri bir BrowserWindow olarak yonetilir.
 * Ayni renderer URL'sini yukler fakat ?quakeMode=1 query parametresiyle;
 * renderer bu parametreyi gorunce HUD gorunumunu etkinlestirebilir.
 */

let quakeWin: BrowserWindow | null = null;
let isVisible = false;
let currentSettings: QuakeSettings = { ...DEFAULT_QUAKE_SETTINGS };
let registeredHotkey = '';

function getQuakeWindowBounds(): { x: number; y: number; width: number; height: number } {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
  const heightPx = Math.round((currentSettings.heightPercent / 100) * screenHeight);
  return { x: 0, y: 0, width: screenWidth, height: heightPx };
}

function createQuakeWindowIfNeeded(isDev: boolean, rendererUrl?: string): void {
  if (quakeWin && !quakeWin.isDestroyed()) return;

  const bounds = getQuakeWindowBounds();

  quakeWin = new BrowserWindow({
    ...bounds,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  quakeWin.setAlwaysOnTop(true, 'screen-saver');

  if (isDev && rendererUrl) {
    void quakeWin.loadURL(rendererUrl + '?quakeMode=1');
  } else {
    void quakeWin.loadFile(join(__dirname, '../renderer/index.html'), {
      query: { quakeMode: '1' }
    });
  }

  quakeWin.on('blur', () => {
    if (currentSettings.autoHideOnBlur && isVisible) {
      hideQuakeWindow();
    }
  });

  quakeWin.on('closed', () => {
    quakeWin = null;
    isVisible = false;
  });
}

function showQuakeWindow(): void {
  if (!quakeWin || quakeWin.isDestroyed()) return;

  const bounds = getQuakeWindowBounds();
  quakeWin.setBounds(bounds);
  quakeWin.showInactive();
  quakeWin.focus();
  isVisible = true;
}

function hideQuakeWindow(): void {
  if (!quakeWin || quakeWin.isDestroyed()) return;
  quakeWin.hide();
  isVisible = false;
}

function toggleQuakeWindow(): void {
  if (isVisible) {
    hideQuakeWindow();
  } else {
    showQuakeWindow();
  }
}

function registerGlobalHotkey(hotkey: string): boolean {
  if (registeredHotkey) {
    try {
      globalShortcut.unregister(registeredHotkey);
    } catch (_) {
      // sessizce gec
    }
  }
  try {
    const ok = globalShortcut.register(hotkey, toggleQuakeWindow);
    if (ok) registeredHotkey = hotkey;
    return ok;
  } catch (_) {
    return false;
  }
}

/**
 * Quake IPC kanallarini kaydeder.
 * @param isDev  electron-vite gelistirme modu mu?
 * @param rendererUrl  Vite dev server URL'i (sadece dev modunda)
 * @param settings  Baslangic quake ayarlari (settings.json'dan)
 */
export function registerQuakeHandlers(
  isDev: boolean,
  rendererUrl?: string,
  settings?: Partial<QuakeSettings>
): void {
  if (settings) {
    currentSettings = { ...DEFAULT_QUAKE_SETTINGS, ...settings };
  }

  // Pencereyi on olustur (hizli ilk acilma icin)
  createQuakeWindowIfNeeded(isDev, rendererUrl);

  // Global kisayol kaydi
  if (currentSettings.enabled) {
    registerGlobalHotkey(currentSettings.hotkey);
  }

  // IPC: renderer'dan veya settings panelinden tetiklenebilir toggle
  ipcMain.handle(QUAKE_CHANNELS.toggle, () => {
    createQuakeWindowIfNeeded(isDev, rendererUrl);
    toggleQuakeWindow();
    return isVisible;
  });

  // IPC: kisayolu guncelle
  ipcMain.handle(QUAKE_CHANNELS.setHotkey, (_event, newHotkey: string) => {
    currentSettings.hotkey = newHotkey;
    return registerGlobalHotkey(newHotkey);
  });
}

/** Uygulama kapatilirken global kisayolu temizle. */
export function unregisterQuakeHandlers(): void {
  if (registeredHotkey) {
    try {
      globalShortcut.unregister(registeredHotkey);
    } catch (_) {
      // sessizce gec
    }
  }
  if (quakeWin && !quakeWin.isDestroyed()) {
    quakeWin.destroy();
    quakeWin = null;
  }
}
