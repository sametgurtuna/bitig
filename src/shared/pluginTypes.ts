/**
 * Bitig Eklenti Sistemi (Plugin System) paylasilan tip tanimlari ve IPC kanallari.
 */

export type PluginPermission = 'statusbar' | 'actions' | 'snippets' | 'events';

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author?: string;
  main: string;
  permissions?: PluginPermission[];
  homepage?: string;
}

export interface PluginState {
  id: string;
  manifest: PluginManifest;
  enabled: boolean;
  dirPath: string;
  error?: string;
}

export interface StatusBarWidgetContribution {
  pluginId: string;
  widgetId: string;
  label: string;
  icon?: string;
  tooltip?: string;
  color?: string;
}

export interface PluginActionContribution {
  pluginId: string;
  actionId: string;
  name: string;
  category: string;
  defaultKeys?: string;
  description: string;
}

export interface PluginContributions {
  widgets: StatusBarWidgetContribution[];
  actions: PluginActionContribution[];
}

export const PLUGIN_CHANNELS = {
  list: 'plugin:list',
  toggle: 'plugin:toggle',
  reload: 'plugin:reload',
  openDir: 'plugin:open-dir',
  getContributions: 'plugin:get-contributions',
  contributions: 'plugin:contributions'
} as const;
