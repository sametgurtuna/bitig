import { join } from 'node:path';
import { app, BrowserWindow, globalShortcut, shell } from 'electron';
import { PtyManager } from './pty/ptyManager';
import { registerPtyHandlers } from './ipc/ptyHandlers';
import { attachWindowEvents, registerWindowHandlers } from './ipc/windowHandlers';
import { registerThemeHandlers } from './ipc/themeHandlers';
import { registerSettingsHandlers } from './ipc/settingsHandlers';
import { registerFontHandlers } from './ipc/fontHandlers';
import { registerSnippetHandlers } from './ipc/snippetHandlers';
import { registerHistoryHandlers } from './ipc/historyHandlers';
import { registerCockpitHandlers } from './ipc/cockpitHandlers';
import { registerCompletionHandlers } from './ipc/completionHandlers';
import { registerQuakeHandlers, unregisterQuakeHandlers } from './ipc/quakeHandlers';
import { registerAiHandlers } from './ipc/aiHandlers';
import { PluginManager } from './plugins/pluginManager';
import { registerPluginHandlers } from './ipc/pluginHandlers';
import { ThemeStore } from './theme/themeStore';
import { SettingsStore } from './settings/settingsStore';
import { SnippetStore } from './snippets/snippetStore';
import { HistoryStore } from './history/historyStore';

// app.getPath('userData') varsayilan olarak package.json > name'e gore
// hesaplanir; bunu acikca 'Bitig' yapiyoruz ki CLAUDE.md'de belgelenen
// %APPDATA%/Bitig/ konumu (buyuk B ile) tam olarak eslessin.
app.setName('Bitig');

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  // Bitig'i ikinci kez calistirmak mevcut pencereyi one getirmez; Windows
  // Terminal'de oldugu gibi YENI ve bagimsiz bir pencere acar. Tek proses
  // kaldigimiz icin settings.json/history.json'in tek yazicisi olur.
  app.on('second-instance', () => {
    if (app.isReady()) createMainWindow();
  });
}

const ptyManager = new PtyManager();
const themeStore = new ThemeStore();
const settingsStore = new SettingsStore();
const snippetStore = new SnippetStore();
const historyStore = new HistoryStore();
const pluginManager = new PluginManager();

const iconPath = join(__dirname, '../../assets/icon.png');

/** Acik ana pencereler. Quake HUD bu sete girmez - cikis karari sadece
 *  gercek Bitig pencerelerine bakar. */
const mainWindows = new Set<BrowserWindow>();

/** Son ana pencere kapaninca uygulamayi tamamen sonlandirir.
 *  `window-all-closed`'a guvenemeyiz: gizli Quake HUD penceresi acikken o olay
 *  hic tetiklenmez ve uygulama arkaplanda hayalet proses olarak kalir. */
function quitIfNoMainWindows(): void {
  if (mainWindows.size > 0) return;
  ptyManager.disposeAll();
  unregisterQuakeHandlers();
  globalShortcut.unregisterAll();
  app.quit();
}

function createMainWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1100,
    height: 700,
    minWidth: 480,
    minHeight: 320,
    show: false,
    frame: false,
    icon: iconPath,
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

  mainWindows.add(mainWindow);
  const ownerId = mainWindow.webContents.id;
  mainWindow.on('closed', () => {
    mainWindows.delete(mainWindow);
    // Sadece bu pencereye ait shell'ler oldurulur; diger pencereler etkilenmez.
    ptyManager.disposeByOwner(ownerId);
    quitIfNoMainWindows();
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  // Uygulama disina acilan linkleri varsayilan tarayicida ac.
  mainWindow.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url);
    return { action: 'deny' };
  });

  attachWindowEvents(mainWindow);
  void pluginManager.init(mainWindow.webContents);

  mainWindow.webContents.on('did-finish-load', () => {
    pluginManager.broadcastContributions();
  });

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
  registerPtyHandlers(ptyManager, settingsStore);
  registerWindowHandlers(() => createMainWindow());
  registerThemeHandlers(themeStore);
  registerSettingsHandlers(settingsStore);
  registerFontHandlers();
  registerSnippetHandlers(snippetStore);
  registerHistoryHandlers(historyStore);
  registerCockpitHandlers();
  registerCompletionHandlers();
  registerAiHandlers(settingsStore);
  registerPluginHandlers(pluginManager);

  createMainWindow();
  setupQuakeHud(settingsStore);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  ptyManager.disposeAll();
  app.quit();
});

app.on('before-quit', () => {
  ptyManager.disposeAll();
  unregisterQuakeHandlers();
  globalShortcut.unregisterAll();
});
