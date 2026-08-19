import { ipcMain } from 'electron';
import { HISTORY_CHANNELS } from '../../shared/historyTypes';
import type { HistoryStore } from '../history/historyStore';

export function registerHistoryHandlers(store: HistoryStore): void {
  ipcMain.handle(HISTORY_CHANNELS.list, () => {
    return store.list();
  });

  ipcMain.handle(
    HISTORY_CHANNELS.add,
    (
      _event,
      payload: { command: string; cwd?: string; durationMs?: number; exitCode?: number }
    ) => {
      return store.add(payload.command, payload.cwd, payload.durationMs, payload.exitCode);
    }
  );

  ipcMain.handle(HISTORY_CHANNELS.clear, () => {
    return store.clear();
  });
}
