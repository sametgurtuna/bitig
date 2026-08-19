import { ipcMain, shell } from 'electron';
import { COCKPIT_CHANNELS } from '../../shared/cockpitTypes';

export function registerCockpitHandlers(): void {
  ipcMain.handle(COCKPIT_CHANNELS.openUrl, async (_event, url: string) => {
    try {
      if (url.startsWith('http://') || url.startsWith('https://')) {
        await shell.openExternal(url);
        return true;
      }
      return false;
    } catch (error) {
      console.error(`[Bitig] URL acilamadi: ${String(error)}`);
      return false;
    }
  });

  ipcMain.handle(
    COCKPIT_CHANNELS.openFile,
    async (
      _event,
      payload: { filePath: string; line?: number; column?: number }
    ) => {
      try {
        const { filePath, line, column } = payload;
        // VS Code URL protocol destegi: vscode://file/path:line:col
        if (line !== undefined) {
          const colStr = column !== undefined ? `:${column}` : '';
          const vscodeUri = `vscode://file/${filePath.replace(/\\/g, '/')}:${line}${colStr}`;
          try {
            await shell.openExternal(vscodeUri);
            return true;
          } catch {
            // VS Code acilamazsa standart shell.openPath'e don
          }
        }
        await shell.openPath(filePath);
        return true;
      } catch (error) {
        console.error(`[Bitig] Dosya acilamadi: ${String(error)}`);
        return false;
      }
    }
  );
}
