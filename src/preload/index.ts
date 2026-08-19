import { contextBridge, ipcRenderer } from 'electron';
import { PTY_CHANNELS } from '../shared/ptyTypes';
import type {
  PtyCreateOptions,
  PtyCreateResult,
  PtyDataEvent,
  PtyExitEvent
} from '../shared/ptyTypes';
import { WINDOW_CHANNELS, type WindowMaximizeChangeEvent, type WindowNotifyPayload } from '../shared/windowTypes';
import { THEME_CHANNELS } from '../shared/themeTypes';
import type { BitigTheme } from '../shared/themeTypes';
import { SETTINGS_CHANNELS } from '../shared/settingsTypes';
import type { BitigSettings, BitigSettingsPatch } from '../shared/settingsTypes';
import { FONT_CHANNELS } from '../shared/fontTypes';
import { SNIPPET_CHANNELS, type BitigSnippet } from '../shared/snippetTypes';
import { HISTORY_CHANNELS, type HistoryEntry } from '../shared/historyTypes';
import { COCKPIT_CHANNELS } from '../shared/cockpitTypes';
import { QUAKE_CHANNELS } from '../shared/quakeTypes';

// nodeIntegration kapali, contextIsolation acik: renderer'a sadece bu daralmis
// API yuzeyi contextBridge ile sunulur, dogrudan Node/Electron erisimi verilmez.
const ptyApi = {
  create: (options: PtyCreateOptions): Promise<PtyCreateResult> =>
    ipcRenderer.invoke(PTY_CHANNELS.create, options),

  write: (id: string, data: string): void => {
    ipcRenderer.send(PTY_CHANNELS.write, { id, data });
  },

  resize: (id: string, cols: number, rows: number): void => {
    ipcRenderer.send(PTY_CHANNELS.resize, { id, cols, rows });
  },

  dispose: (id: string): void => {
    ipcRenderer.send(PTY_CHANNELS.dispose, { id });
  },

  onData: (listener: (event: PtyDataEvent) => void): (() => void) => {
    const subscription = (_event: Electron.IpcRendererEvent, payload: PtyDataEvent): void =>
      listener(payload);
    ipcRenderer.on(PTY_CHANNELS.data, subscription);
    return () => ipcRenderer.removeListener(PTY_CHANNELS.data, subscription);
  },

  onExit: (listener: (event: PtyExitEvent) => void): (() => void) => {
    const subscription = (_event: Electron.IpcRendererEvent, payload: PtyExitEvent): void =>
      listener(payload);
    ipcRenderer.on(PTY_CHANNELS.exit, subscription);
    return () => ipcRenderer.removeListener(PTY_CHANNELS.exit, subscription);
  }
};

const windowApi = {
  minimize: (): void => {
    ipcRenderer.send(WINDOW_CHANNELS.minimize);
  },

  toggleMaximize: (): void => {
    ipcRenderer.send(WINDOW_CHANNELS.toggleMaximize);
  },

  close: (): void => {
    ipcRenderer.send(WINDOW_CHANNELS.close);
  },

  isMaximized: (): Promise<boolean> => ipcRenderer.invoke(WINDOW_CHANNELS.isMaximized),

  notify: (payload: WindowNotifyPayload): void => {
    ipcRenderer.send(WINDOW_CHANNELS.notify, payload);
  },

  onMaximizeChange: (listener: (event: WindowMaximizeChangeEvent) => void): (() => void) => {
    const subscription = (
      _event: Electron.IpcRendererEvent,
      payload: WindowMaximizeChangeEvent
    ): void => listener(payload);
    ipcRenderer.on(WINDOW_CHANNELS.maximizeChange, subscription);
    return () => ipcRenderer.removeListener(WINDOW_CHANNELS.maximizeChange, subscription);
  }
};

const themeApi = {
  list: (): Promise<BitigTheme[]> => ipcRenderer.invoke(THEME_CHANNELS.list),

  onListChanged: (listener: () => void): (() => void) => {
    const subscription = (): void => listener();
    ipcRenderer.on(THEME_CHANNELS.listChanged, subscription);
    return () => ipcRenderer.removeListener(THEME_CHANNELS.listChanged, subscription);
  }
};

const settingsApi = {
  get: (): Promise<BitigSettings> => ipcRenderer.invoke(SETTINGS_CHANNELS.get),

  set: (patch: BitigSettingsPatch): void => {
    ipcRenderer.send(SETTINGS_CHANNELS.set, patch);
  },

  readBackgroundImage: (): Promise<string | null> =>
    ipcRenderer.invoke(SETTINGS_CHANNELS.readBackgroundImage),

  pickBackgroundImage: (): Promise<string | null> =>
    ipcRenderer.invoke(SETTINGS_CHANNELS.pickBackgroundImage),

  reset: (): void => {
    ipcRenderer.send(SETTINGS_CHANNELS.reset);
  },

  onChanged: (listener: (settings: BitigSettings) => void): (() => void) => {
    const subscription = (_event: Electron.IpcRendererEvent, settings: BitigSettings): void =>
      listener(settings);
    ipcRenderer.on(SETTINGS_CHANNELS.changed, subscription);
    return () => ipcRenderer.removeListener(SETTINGS_CHANNELS.changed, subscription);
  }
};

const fontsApi = {
  list: (): Promise<string[]> => ipcRenderer.invoke(FONT_CHANNELS.list)
};

const snippetsApi = {
  list: (): Promise<BitigSnippet[]> => ipcRenderer.invoke(SNIPPET_CHANNELS.list),
  save: (snippet: BitigSnippet): Promise<BitigSnippet[]> =>
    ipcRenderer.invoke(SNIPPET_CHANNELS.save, snippet),
  delete: (id: string): Promise<BitigSnippet[]> =>
    ipcRenderer.invoke(SNIPPET_CHANNELS.delete, id),
  reset: (): Promise<BitigSnippet[]> => ipcRenderer.invoke(SNIPPET_CHANNELS.reset)
};

const historyApi = {
  list: (): Promise<HistoryEntry[]> => ipcRenderer.invoke(HISTORY_CHANNELS.list),
  add: (payload: { command: string; cwd?: string; durationMs?: number; exitCode?: number }): Promise<HistoryEntry[]> =>
    ipcRenderer.invoke(HISTORY_CHANNELS.add, payload),
  clear: (): Promise<HistoryEntry[]> => ipcRenderer.invoke(HISTORY_CHANNELS.clear)
};

const cockpitApi = {
  openUrl: (url: string): Promise<boolean> => ipcRenderer.invoke(COCKPIT_CHANNELS.openUrl, url),
  openFile: (payload: { filePath: string; line?: number; column?: number }): Promise<boolean> =>
    ipcRenderer.invoke(COCKPIT_CHANNELS.openFile, payload)
};

const quakeApi = {
  /** Quake HUD penceresini goster/gizle. Yeni gorünürlük durumunu (boolean) doner. */
  toggle: (): Promise<boolean> => ipcRenderer.invoke(QUAKE_CHANNELS.toggle),
  /** Global kisayolu guncelle. Kayit basarili ise true doner. */
  setHotkey: (hotkey: string): Promise<boolean> =>
    ipcRenderer.invoke(QUAKE_CHANNELS.setHotkey, hotkey)
};

export type BitigApi = {
  pty: typeof ptyApi;
  windowControls: typeof windowApi;
  theme: typeof themeApi;
  settings: typeof settingsApi;
  fonts: typeof fontsApi;
  snippets: typeof snippetsApi;
  history: typeof historyApi;
  cockpit: typeof cockpitApi;
  quake: typeof quakeApi;
};

const bitigApi: BitigApi = {
  pty: ptyApi,
  windowControls: windowApi,
  theme: themeApi,
  settings: settingsApi,
  fonts: fontsApi,
  snippets: snippetsApi,
  history: historyApi,
  cockpit: cockpitApi,
  quake: quakeApi
};

contextBridge.exposeInMainWorld('bitig', bitigApi);
