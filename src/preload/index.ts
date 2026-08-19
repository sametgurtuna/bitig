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

export type BitigApi = {
  pty: typeof ptyApi;
  windowControls: typeof windowApi;
};

const bitigApi: BitigApi = { pty: ptyApi, windowControls: windowApi };

contextBridge.exposeInMainWorld('bitig', bitigApi);
