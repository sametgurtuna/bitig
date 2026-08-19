import { contextBridge, ipcRenderer } from 'electron';
import { PTY_CHANNELS } from '../shared/ptyTypes';
import type {
  PtyCreateOptions,
  PtyCreateResult,
  PtyDataEvent,
  PtyExitEvent
} from '../shared/ptyTypes';
import { WINDOW_CHANNELS } from '../shared/windowTypes';
import type { WindowMaximizeChangeEvent } from '../shared/windowTypes';
import { THEME_CHANNELS } from '../shared/themeTypes';
import type { BitigTheme } from '../shared/themeTypes';
import { SETTINGS_CHANNELS } from '../shared/settingsTypes';
import type { BitigSettings, BitigSettingsPatch } from '../shared/settingsTypes';

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

  onChanged: (listener: (settings: BitigSettings) => void): (() => void) => {
    const subscription = (_event: Electron.IpcRendererEvent, settings: BitigSettings): void =>
      listener(settings);
    ipcRenderer.on(SETTINGS_CHANNELS.changed, subscription);
    return () => ipcRenderer.removeListener(SETTINGS_CHANNELS.changed, subscription);
  }
};

export type BitigApi = {
  pty: typeof ptyApi;
  windowControls: typeof windowApi;
  theme: typeof themeApi;
  settings: typeof settingsApi;
};

const bitigApi: BitigApi = {
  pty: ptyApi,
  windowControls: windowApi,
  theme: themeApi,
  settings: settingsApi
};

contextBridge.exposeInMainWorld('bitig', bitigApi);
