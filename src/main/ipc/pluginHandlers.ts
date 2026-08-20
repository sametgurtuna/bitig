import { ipcMain } from 'electron';
import { PLUGIN_CHANNELS } from '../../shared/pluginTypes';
import type { PluginManager } from '../plugins/pluginManager';

export function registerPluginHandlers(pluginManager: PluginManager): void {
  ipcMain.handle(PLUGIN_CHANNELS.list, () => {
    return pluginManager.listPlugins();
  });

  ipcMain.handle(PLUGIN_CHANNELS.getContributions, () => {
    return pluginManager.getContributions();
  });

  ipcMain.handle(PLUGIN_CHANNELS.toggle, (_event, payload: { id: string; enabled: boolean }) => {
    return pluginManager.togglePlugin(payload.id, payload.enabled);
  });

  ipcMain.handle(PLUGIN_CHANNELS.reload, async () => {
    return await pluginManager.loadAllPlugins();
  });

  ipcMain.on(PLUGIN_CHANNELS.openDir, () => {
    pluginManager.openPluginsDirectory();
  });

  ipcMain.on('plugin:execute-action', (_event, payload: { actionId: string }) => {
    pluginManager.executeAction(payload.actionId);
  });
}
