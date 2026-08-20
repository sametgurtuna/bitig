import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import os from 'node:os';
import { app, shell, type WebContents } from 'electron';
import type {
  PluginManifest,
  PluginState,
  PluginContributions,
  StatusBarWidgetContribution,
  PluginActionContribution
} from '../../shared/pluginTypes';

interface PluginRuntimeInstance {
  state: PluginState;
  timers: NodeJS.Timeout[];
  actionHandlers: Map<string, () => void>;
}

function resolveGitBranch(targetDir?: string): string | null {
  try {
    let dir = targetDir || process.cwd();
    for (let i = 0; i < 15; i++) {
      const gitHead = path.join(dir, '.git', 'HEAD');
      if (fs.existsSync(gitHead)) {
        const headContent = fs.readFileSync(gitHead, 'utf-8').trim();
        if (headContent.startsWith('ref: refs/heads/')) {
          return headContent.replace('ref: refs/heads/', '');
        }
        return headContent.slice(0, 7);
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    return null;
  } catch {
    return null;
  }
}

export class PluginManager {
  private readonly pluginsDir = path.join(app.getPath('userData'), 'plugins');
  private readonly statesFile = path.join(app.getPath('userData'), 'plugin-states.json');
  private plugins = new Map<string, PluginRuntimeInstance>();
  private disabledPluginIds = new Set<string>();
  private webContents: WebContents | null = null;
  private widgets = new Map<string, StatusBarWidgetContribution>();
  private actions = new Map<string, PluginActionContribution>();

  async init(webContents: WebContents): Promise<void> {
    this.webContents = webContents;
    this.ensurePluginsDir();
    this.loadDisabledStates();
    this.seedDefaultPlugins();
    await this.loadAllPlugins();
  }

  private ensurePluginsDir(): void {
    if (!fs.existsSync(this.pluginsDir)) {
      fs.mkdirSync(this.pluginsDir, { recursive: true });
    }
  }

  private loadDisabledStates(): void {
    try {
      if (fs.existsSync(this.statesFile)) {
        const raw = fs.readFileSync(this.statesFile, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.disabled)) {
          this.disabledPluginIds = new Set(parsed.disabled);
        }
      }
    } catch (err) {
      console.error('[PluginManager] Durum dosyasi okunamadi:', err);
    }
  }

  private saveDisabledStates(): void {
    try {
      fs.writeFileSync(
        this.statesFile,
        JSON.stringify({ disabled: Array.from(this.disabledPluginIds) }, null, 2),
        'utf-8'
      );
    } catch (err) {
      console.error('[PluginManager] Durum dosyasi kaydedilemedi:', err);
    }
  }

  private seedDefaultPlugins(): void {
    // 1. Git Status Plugin
    const gitDir = path.join(this.pluginsDir, 'git-status');
    fs.mkdirSync(gitDir, { recursive: true });
    fs.writeFileSync(
      path.join(gitDir, 'plugin.json'),
      JSON.stringify(
        {
          id: 'git-status',
          name: 'Git Branch Sentinel',
          version: '1.0.0',
          description: 'Displays the active Git branch of the working directory in the status bar.',
          author: 'Bitig Team',
          main: 'main.js',
          permissions: ['statusbar', 'events']
        },
        null,
        2
      )
    );
    fs.writeFileSync(
      path.join(gitDir, 'main.js'),
      `
function updateGit() {
  const branch = bitig.getGitBranch();
  if (branch) {
    bitig.ui.setStatusBarWidget({
      id: 'git-branch',
      label: branch,
      tooltip: 'Active Git Branch: ' + branch,
      color: '#86efac'
    });
  } else {
    bitig.ui.setStatusBarWidget({
      id: 'git-branch',
      label: 'Git',
      tooltip: 'Git Repository (main)',
      color: '#94a3b8'
    });
  }
}

updateGit();
bitig.setInterval(updateGit, 2500);
      `.trim()
    );

    // 2. System Monitor Plugin
    const sysDir = path.join(this.pluginsDir, 'system-monitor');
    fs.mkdirSync(sysDir, { recursive: true });
    fs.writeFileSync(
      path.join(sysDir, 'plugin.json'),
      JSON.stringify(
        {
          id: 'system-monitor',
          name: 'System Resource Monitor',
          version: '1.0.0',
          description: 'Shows live RAM memory usage and system metrics in the status bar.',
          author: 'Bitig Team',
          main: 'main.js',
          permissions: ['statusbar']
        },
        null,
        2
      )
    );
    fs.writeFileSync(
      path.join(sysDir, 'main.js'),
      `
function updateMetrics() {
  const mem = bitig.getSystemMemory();
  const usedGb = ((mem.total - mem.free) / (1024 * 1024 * 1024)).toFixed(1);
  const totalGb = (mem.total / (1024 * 1024 * 1024)).toFixed(1);
  const percent = Math.round(((mem.total - mem.free) / mem.total) * 100);

  bitig.ui.setStatusBarWidget({
    id: 'sys-ram',
    label: 'RAM ' + usedGb + '/' + totalGb + ' GB',
    tooltip: 'RAM Usage: ' + percent + '%',
    color: percent > 85 ? '#f87171' : '#38bdf8'
  });
}

updateMetrics();
bitig.setInterval(updateMetrics, 2500);
      `.trim()
    );

    // 3. Quick Web Search Plugin
    const searchDir = path.join(this.pluginsDir, 'quick-web-search');
    fs.mkdirSync(searchDir, { recursive: true });
    fs.writeFileSync(
      path.join(searchDir, 'plugin.json'),
      JSON.stringify(
        {
          id: 'quick-web-search',
          name: 'Quick Web & Developer Search',
          version: '1.0.0',
          description: 'Adds Google and StackOverflow lookup actions to the command palette and shortcuts.',
          author: 'Bitig Team',
          main: 'main.js',
          permissions: ['actions']
        },
        null,
        2
      )
    );
    fs.writeFileSync(
      path.join(searchDir, 'main.js'),
      `
bitig.actions.register({
  id: 'plugin.search.google',
  name: 'Search on Google',
  category: 'Plugins',
  defaultKeys: 'Alt+G',
  description: 'Opens Google search query in default web browser',
  handler: function() {
    bitig.openUrl('https://www.google.com');
  }
});

bitig.actions.register({
  id: 'plugin.search.stackoverflow',
  name: 'Search on StackOverflow',
  category: 'Plugins',
  defaultKeys: 'Alt+S',
  description: 'Opens StackOverflow developer Q&A in default web browser',
  handler: function() {
    bitig.openUrl('https://stackoverflow.com');
  }
});
      `.trim()
    );
  }

  async loadAllPlugins(): Promise<PluginState[]> {
    this.unloadAllPlugins();

    if (!fs.existsSync(this.pluginsDir)) {
      return [];
    }

    const entries = fs.readdirSync(this.pluginsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const pluginDir = path.join(this.pluginsDir, entry.name);
      const manifestPath = path.join(pluginDir, 'plugin.json');

      if (!fs.existsSync(manifestPath)) continue;

      try {
        const rawManifest = fs.readFileSync(manifestPath, 'utf-8');
        const manifest = JSON.parse(rawManifest) as PluginManifest;
        const enabled = !this.disabledPluginIds.has(manifest.id);

        const instance: PluginRuntimeInstance = {
          state: {
            id: manifest.id,
            manifest,
            enabled,
            dirPath: pluginDir
          },
          timers: [],
          actionHandlers: new Map()
        };

        this.plugins.set(manifest.id, instance);

        if (enabled) {
          this.executePlugin(instance);
        }
      } catch (err) {
        console.error(`[PluginManager] Eklenti yuklenemedi (${entry.name}):`, err);
      }
    }

    this.broadcastContributions();
    return this.listPlugins();
  }

  private executePlugin(instance: PluginRuntimeInstance): void {
    const { manifest, dirPath } = instance.state;
    const scriptPath = path.join(dirPath, manifest.main);

    if (!fs.existsSync(scriptPath)) {
      instance.state.error = `Entry file not found: ${manifest.main}`;
      return;
    }

    try {
      const code = fs.readFileSync(scriptPath, 'utf-8');

      // Create Secure Sandbox API
      const sandboxApi = {
        ui: {
          setStatusBarWidget: (widget: { id: string; label: string; tooltip?: string; color?: string }) => {
            const key = `${manifest.id}:${widget.id}`;
            this.widgets.set(key, {
              pluginId: manifest.id,
              widgetId: widget.id,
              label: widget.label,
              tooltip: widget.tooltip,
              color: widget.color
            });
            this.broadcastContributions();
          }
        },
        actions: {
          register: (action: { id: string; name: string; category?: string; defaultKeys?: string; description?: string; handler?: () => void }) => {
            this.actions.set(action.id, {
              pluginId: manifest.id,
              actionId: action.id,
              name: action.name,
              category: action.category || 'Plugins',
              defaultKeys: action.defaultKeys,
              description: action.description || ''
            });
            if (action.handler) {
              instance.actionHandlers.set(action.id, action.handler);
            }
            this.broadcastContributions();
          }
        },
        getGitBranch: (targetDir?: string) => resolveGitBranch(targetDir),
        getSystemMemory: () => ({
          total: os.totalmem(),
          free: os.freemem()
        }),
        openUrl: (url: string) => {
          if (url && (url.startsWith('https://') || url.startsWith('http://'))) {
            void shell.openExternal(url);
          }
        },
        log: (...args: unknown[]) => {
          console.log(`[Plugin:${manifest.id}]`, ...args);
        },
        setInterval: (fn: () => void, ms: number) => {
          const timer = setInterval(fn, Math.max(1000, ms));
          instance.timers.push(timer);
          return timer;
        },
        setTimeout: (fn: () => void, ms: number) => {
          const timer = setTimeout(fn, ms);
          instance.timers.push(timer);
          return timer;
        },
        clearInterval: (timer: NodeJS.Timeout) => clearInterval(timer),
        clearTimeout: (timer: NodeJS.Timeout) => clearTimeout(timer)
      };

      const context = vm.createContext({
        bitig: sandboxApi,
        console: {
          log: sandboxApi.log,
          warn: sandboxApi.log,
          error: sandboxApi.log
        },
        Math,
        Date,
        JSON,
        parseInt,
        parseFloat,
        String,
        Number,
        Boolean,
        Array,
        Object
      });

      const script = new vm.Script(code, { filename: manifest.main });
      script.runInContext(context, { timeout: 3000 });
      instance.state.error = undefined;
    } catch (err) {
      console.error(`[PluginManager] Eklenti calistirilirken hata (${manifest.id}):`, err);
      instance.state.error = (err as Error).message;
    }
  }

  private unloadPlugin(instance: PluginRuntimeInstance): void {
    // Zamanlayicilari temizle
    for (const timer of instance.timers) {
      clearInterval(timer);
      clearTimeout(timer);
    }
    instance.timers = [];

    // Widget'lari kaldir
    for (const key of Array.from(this.widgets.keys())) {
      if (key.startsWith(`${instance.state.id}:`)) {
        this.widgets.delete(key);
      }
    }

    // Aksiyonlari kaldir
    for (const [actionId, action] of Array.from(this.actions.entries())) {
      if (action.pluginId === instance.state.id) {
        this.actions.delete(actionId);
      }
    }
    instance.actionHandlers.clear();
  }

  private unloadAllPlugins(): void {
    for (const instance of this.plugins.values()) {
      this.unloadPlugin(instance);
    }
    this.plugins.clear();
    this.widgets.clear();
    this.actions.clear();
  }

  togglePlugin(id: string, enabled: boolean): PluginState[] {
    if (enabled) {
      this.disabledPluginIds.delete(id);
    } else {
      this.disabledPluginIds.add(id);
    }
    this.saveDisabledStates();

    const instance = this.plugins.get(id);
    if (instance) {
      instance.state.enabled = enabled;
      if (enabled) {
        this.executePlugin(instance);
      } else {
        this.unloadPlugin(instance);
      }
      this.broadcastContributions();
    }

    return this.listPlugins();
  }

  executeAction(actionId: string): void {
    for (const instance of this.plugins.values()) {
      const handler = instance.actionHandlers.get(actionId);
      if (handler) {
        try {
          handler();
        } catch (err) {
          console.error(`[PluginManager] Eylem calistirma hatasi (${actionId}):`, err);
        }
        return;
      }
    }
  }

  openPluginsDirectory(): void {
    void shell.openPath(this.pluginsDir);
  }

  listPlugins(): PluginState[] {
    return Array.from(this.plugins.values()).map((p) => p.state);
  }

  getContributions(): PluginContributions {
    return {
      widgets: Array.from(this.widgets.values()),
      actions: Array.from(this.actions.values())
    };
  }

  broadcastContributions(): void {
    if (this.webContents && !this.webContents.isDestroyed()) {
      try {
        this.webContents.send(PLUGIN_CHANNELS.contributions, this.getContributions());
      } catch {
        // sessizce gec
      }
    }
  }
}
