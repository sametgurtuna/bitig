import { join } from 'node:path';
import { app, BrowserWindow, shell } from 'electron';
import { PtyManager } from './pty/ptyManager';
import { registerPtyHandlers } from './ipc/ptyHandlers';
import { registerWindowHandlers } from './ipc/windowHandlers';
import { registerThemeHandlers } from './ipc/themeHandlers';
import { registerSettingsHandlers } from './ipc/settingsHandlers';
import { registerFontHandlers } from './ipc/fontHandlers';
import { registerSnippetHandlers } from './ipc/snippetHandlers';
import { registerHistoryHandlers } from './ipc/historyHandlers';
import { registerCockpitHandlers } from './ipc/cockpitHandlers';
import { registerQuakeHandlers, unregisterQuakeHandlers } from './ipc/quakeHandlers';
import { ThemeStore } from './theme/themeStore';
import { SettingsStore } from './settings/settingsStore';
import { SnippetStore } from './snippets/snippetStore';
import { HistoryStore } from './history/historyStore';

// app.getPath('userData') varsayilan olarak package.json > name'e gore
// hesaplanir; bunu acikca 'Bitig' yapiyoruz ki CLAUDE.md'de belgelenen
// %APPDATA%/Bitig/ konumu (buyuk B ile) tam olarak eslessin.
app.setName('Bitig');

const ptyManager = new PtyManager();
const themeStore = new ThemeStore();
const settingsStore = new SettingsStore();
const snippetStore = new SnippetStore();
const historyStore = new HistoryStore();

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

/** Quake HUD handler'ini uygulama hazir oldugunda kaydeder. */
function setupQuakeHud(settings: SettingsStore): void {
  const isDev = !app.isPackaged;
  const rendererUrl = isDev ? process.env['ELECTRON_RENDERER_URL'] : undefined;
  const quakeSettings = settings.get().quake;
  registerQuakeHandlers(isDev, rendererUrl, quakeSettings);
}

void app.whenReady().then(async () => {
  // Store'lar ilk pencere olusmadan once yuklenmeli: IPC handler'lari
  // (registerThemeHandlers/registerSettingsHandlers) kayit anindan itibaren
  // gecerli veri donebilmeli.
  await settingsStore.load();
  themeStore.load();
  snippetStore.load();
  historyStore.load();

  // Pencereye bagli olmayan handler'lar; ipcMain.handle ayni kanal icin
  // ikinci kez cagrilinca hata verdigi icin pencere olusturmanin degil
  // uygulama baslangicinin parcasi.
  registerFontHandlers();
  registerSnippetHandlers(snippetStore);
  registerHistoryHandlers(historyStore);
  registerCockpitHandlers();

  createMainWindow();
  setupQuakeHud(settingsStore);

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
  unregisterQuakeHandlers();
});
