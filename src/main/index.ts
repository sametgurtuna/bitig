import { join } from 'node:path';
import { app, BrowserWindow, shell } from 'electron';
import { PtyManager } from './pty/ptyManager';
import { registerPtyHandlers } from './ipc/ptyHandlers';
import { registerWindowHandlers } from './ipc/windowHandlers';
import { registerThemeHandlers } from './ipc/themeHandlers';
import { registerSettingsHandlers } from './ipc/settingsHandlers';
import { ThemeStore } from './theme/themeStore';
import { SettingsStore } from './settings/settingsStore';

// app.getPath('userData') varsayilan olarak package.json > name'e gore
// hesaplanir; bunu acikca 'Bitig' yapiyoruz ki CLAUDE.md'de belgelenen
// %APPDATA%/Bitig/ konumu (buyuk B ile) tam olarak eslessin.
app.setName('Bitig');

const ptyManager = new PtyManager();
const themeStore = new ThemeStore();
const settingsStore = new SettingsStore();

function createMainWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1100,
    height: 700,
    minWidth: 480,
    minHeight: 320,
    show: false,
    frame: false,
    // Cerceve kaldirilinca kose yuvarlama ve golge OS'ten gelmiyor; bunu
    // renderer'daki #app konteynerinde CSS ile (border-radius + box-shadow)
    // taklit ediyoruz, bu yuzden pencere transparan olmali.
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  // Uygulama disina acilan linkleri varsayilan tarayicida ac.
  mainWindow.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url);
    return { action: 'deny' };
  });

  registerPtyHandlers(ptyManager, mainWindow.webContents);
  registerWindowHandlers(mainWindow);
  registerThemeHandlers(themeStore, mainWindow.webContents);
  registerSettingsHandlers(settingsStore, mainWindow);

  const isDev = !app.isPackaged;
  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

void app.whenReady().then(() => {
  // Store'lar ilk pencere olusmadan once yuklenmeli: IPC handler'lari
  // (registerThemeHandlers/registerSettingsHandlers) kayit anindan itibaren
  // gecerli veri donebilmeli.
  settingsStore.load();
  themeStore.load();

  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  ptyManager.disposeAll();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  ptyManager.disposeAll();
});
