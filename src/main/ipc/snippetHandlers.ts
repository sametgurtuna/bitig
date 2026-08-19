import { ipcMain } from 'electron';
import { SNIPPET_CHANNELS, type BitigSnippet } from '../../shared/snippetTypes';
import type { SnippetStore } from '../snippets/snippetStore';

export function registerSnippetHandlers(store: SnippetStore): void {
  ipcMain.handle(SNIPPET_CHANNELS.list, () => {
    return store.list();
  });

  ipcMain.handle(SNIPPET_CHANNELS.save, (_event, snippet: BitigSnippet) => {
    return store.save(snippet);
  });

  ipcMain.handle(SNIPPET_CHANNELS.delete, (_event, id: string) => {
    return store.delete(id);
  });

  ipcMain.handle(SNIPPET_CHANNELS.reset, () => {
    return store.reset();
  });
}
