import type { ITheme } from '@xterm/xterm';
import {
  closeLeafFromTree,
  collectLeaves,
  createPaneLeaf,
  disposePaneLeaf,
  findLeaf,
  navigateDirection,
  renderPaneTree,
  splitLeaf,
  type CreatePaneLeafOptions,
  type PaneLeaf,
  type PaneNode,
  type SplitDirection,
  type TerminalFontOptions
} from './panes';
import { bitigDark } from '../../shared/builtinThemes';
import type { BitigSettings } from '../../shared/settingsTypes';
import type { ShellProfile } from '../../shared/profileTypes';
import type { ActionId } from '../../shared/actionTypes';
import { SearchBar } from './searchBar';
import type { KeybindingManager } from './keybindings';
import { ExecutionTelemetry } from './telemetry';
import { PortSniffer } from './portSniffer';
import { CwdTracker } from './cwdTracker';
import { InlineSuggestions } from './autocomplete';
import type { DiscoveredPort } from '../../shared/cockpitTypes';
import type { TerminalContextMenu, ContextMenuItem } from './contextMenu';
import type { ConfirmModal } from './confirmModal';
import type { StatusBar } from './statusBar';
import type { SessionManager } from './sessionManager';
import { icon } from './icons';

/**
 * Sekme basligi icin yolun son parcasini verir: `C:\Users\samet\Desktop` ->
 * `Desktop`. Surucu kokunde surucu harfi (`C:`), kullanici klasorunde `~`
 * gosterilir.
 */
function folderNameOf(cwd: string): string {
  const normalized = cwd.replace(/[\\/]+$/, '');
  if (!normalized) return cwd;
  if (/^[A-Za-z]:$/.test(normalized)) return normalized;
  const parts = normalized.split(/[\\/]/);
  return parts[parts.length - 1] || normalized;
}

interface Tab {
  id: string;
  title: string;
  root: PaneNode;
  activeLeafId: string;
  containerEl: HTMLDivElement;
  tabEl: HTMLButtonElement;
  profileId: string;
  isZoomed: boolean;
  isCustomTitle?: boolean;
}

/**
 * Sekmeleri, pane agaclarini ve klavye kisayollarini yoneten ana magaza.
 * Profil yonetimi, dahili arama, yonsel split gezinmesi, zoom, baglam menusu,
 * durum cubugu senkronizasyonu ve oturum kurtarma yeteneklerini barindirir.
 */
export class TabStore {
  private readonly tabs: Tab[] = [];
  private readonly tabsById = new Map<string, Tab>();
  private readonly leavesByPtyId = new Map<string, { tab: Tab; leaf: PaneLeaf }>();
  private activeId: string | null = null;
  private currentTerminalTheme: ITheme = bitigDark.terminal;
  private currentFont: TerminalFontOptions = {
    fontFamily: "'Cascadia Code', 'Cascadia Mono', Consolas, monospace",
    fontSize: 14
  };
  private settings: BitigSettings | null = null;
  private readonly searchBar: SearchBar;
  private readonly telemetry: ExecutionTelemetry;
  private readonly portSniffer: PortSniffer;
  private readonly cwdTracker: CwdTracker;
  /** OSC 7/9 ile guvenilir CWD bildiren pane'ler; bunlarda prompt sezgisi devre disidir. */
  private readonly oscCwdLeaves = new Set<string>();
  /** Broadcast Input modu aktif mi? Alt+Shift+I ile togglenir. */
  private isBroadcast = false;
  private readonly broadcastBanner: HTMLDivElement;

  constructor(
    private readonly rootEl: HTMLElement,
    private readonly tabbarListEl: HTMLElement,
    private readonly keybindings: KeybindingManager,
    telemetry?: ExecutionTelemetry,
    private readonly onCycleThemeShortcut?: () => void,
    private readonly contextMenu?: TerminalContextMenu,
    private readonly confirmModal?: ConfirmModal,
    private readonly statusBar?: StatusBar,
    private readonly sessionManager?: SessionManager,
    private readonly onOpenBilge?: () => void
  ) {
    this.searchBar = new SearchBar(this.rootEl);
    this.telemetry = telemetry || new ExecutionTelemetry();
    this.portSniffer = new PortSniffer();
    this.cwdTracker = new CwdTracker();
    this.telemetry.setCwdResolver((paneId) => this.leavesByPtyId.get(paneId)?.leaf.cwd);

    // Broadcast banner: window'un etrafina kirmizi cizgi + uyari mesaji
    this.broadcastBanner = document.createElement('div');
    this.broadcastBanner.id = 'broadcast-banner';
    this.broadcastBanner.innerHTML = `<span class="broadcast-dot"></span><span>Broadcast active: writing to all split panes</span>`;
    document.body.appendChild(this.broadcastBanner);

    window.bitig.pty.onData((event) => {
      const entry = this.leavesByPtyId.get(event.id);
      entry?.leaf.terminal.write(event.data);
      this.telemetry.handleTerminalOutput(event.id, event.data);
      if (entry) {
        this.portSniffer.processOutput(entry.tab.id, entry.leaf.id, event.data);
        // Kabuk entegrasyonu OSC 7 yayiyorsa prompt sezgisine hic girmeyiz.
        if (!this.oscCwdLeaves.has(entry.leaf.id)) {
          this.cwdTracker.processOutput(entry.leaf.id, event.data);
        }
      }
    });

    this.cwdTracker.onCwdChanged((leafId, cwd) => this.handleCwdChange(leafId, cwd, false));

    window.bitig.pty.onExit((event) => {
      const entry = this.leavesByPtyId.get(event.id);
      entry?.leaf.terminal.write(`\r\n[process exited, exit code: ${event.exitCode}]\r\n`);
      this.telemetry.finishCommand(event.id, event.exitCode);
    });

    this.portSniffer.onPortsChanged((ports, tabId) => {
      this.updateTabPorts(tabId, ports);
      if (tabId === this.activeId) {
        this.syncStatusBar();
      }
    });

    this.registerKeybindings();
  }

  private registerKeybindings(): void {
    this.keybindings.registerAction('tab.new', () => void this.createTab());
    this.keybindings.registerAction('window.new', () => window.bitig.windowControls.newWindow());
    this.keybindings.registerAction('tab.close', () => {
      if (this.activeId) void this.requestCloseTab(this.activeId);
    });
    this.keybindings.registerAction('tab.next', () => this.cycleTab(1));
    this.keybindings.registerAction('tab.previous', () => this.cycleTab(-1));

    this.keybindings.registerAction('pane.splitRight', () => void this.splitActivePane('row'));
    this.keybindings.registerAction('pane.splitDown', () => void this.splitActivePane('column'));
    this.keybindings.registerAction('pane.close', () => this.closeActivePane());
    this.keybindings.registerAction('pane.zoom', () => this.toggleZoomActivePane());

    this.keybindings.registerAction('pane.navigateLeft', () => this.navigateActivePane('left'));
    this.keybindings.registerAction('pane.navigateRight', () => this.navigateActivePane('right'));
    this.keybindings.registerAction('pane.navigateUp', () => this.navigateActivePane('up'));
    this.keybindings.registerAction('pane.navigateDown', () => this.navigateActivePane('down'));

    this.keybindings.registerAction('terminal.search', () => this.toggleSearch());
    this.keybindings.registerAction('theme.cycle', () => this.onCycleThemeShortcut?.());
    this.keybindings.registerAction('broadcast.toggle', () => this.toggleBroadcast());

    // 1..9 Profil kisayollari
    for (let i = 1; i <= 9; i++) {
      this.keybindings.registerAction(`profile.open${i}` as ActionId, () => {
        const profiles = this.getProfiles();
        if (i - 1 < profiles.length) {
          void this.createTab(profiles[i - 1].id);
        }
      });
    }
  }

  setSettings(settings: BitigSettings): void {
    this.settings = settings;
    if (settings.keybindings) {
      this.keybindings.setBindings(settings.keybindings);
    }
    if (settings.terminal.showStatusBar !== undefined) {
      this.statusBar?.setVisible(settings.terminal.showStatusBar);
    }
    this.syncStatusBar();
  }

  getProfiles(): ShellProfile[] {
    return this.settings?.profiles || [];
  }

  getDefaultProfile(): ShellProfile | undefined {
    const profiles = this.getProfiles();
    const defaultId = this.settings?.defaultProfileId;
    return profiles.find((p) => p.id === defaultId) || profiles[0];
  }

  getProfileById(id?: string): ShellProfile | undefined {
    if (!id) return this.getDefaultProfile();
    return this.getProfiles().find((p) => p.id === id) || this.getDefaultProfile();
  }

  async createTab(profileId?: string, cwd?: string, customTitle?: string): Promise<void> {
    const profile = this.getProfileById(profileId);
    let ptyId = '';
    const options: CreatePaneLeafOptions = {
      command: profile?.command,
      args: profile?.args,
      cwd: cwd || profile?.startingDirectory,
      copyOnSelect: this.settings?.terminal.copyOnSelect,
      pasteOnRightClick: this.settings?.terminal.pasteOnRightClick,
      scrollback: this.settings?.terminal.scrollback,
      onInput: (data) => this.telemetry.handleTerminalInput(ptyId, data),
      onWrite: (leafId, data) => this.handleLeafWrite(leafId, data),
      onContextMenu: (event, leaf) => this.handlePaneContextMenu(event, leaf),
      onCursorMove: (line, col) => this.statusBar?.updateCursor(line, col),
      onCwdChange: (leafId, newCwd) => this.handleCwdChange(leafId, newCwd, true),
      inlineSuggestions: this.createSuggestions(() => ptyId)
    };

    const leaf = await createPaneLeaf(
      (event) => this.keybindings.isReserved(event),
      this.currentTerminalTheme,
      this.currentFont,
      options
    );
    ptyId = leaf.id;

    const containerEl = document.createElement('div');
    containerEl.className = 'tab-pane hidden';
    this.rootEl.appendChild(containerEl);

    const id = crypto.randomUUID();
    const tabTitle = customTitle || profile?.name || 'PowerShell';
    const tab: Tab = {
      id,
      title: tabTitle,
      root: leaf,
      activeLeafId: leaf.id,
      containerEl,
      tabEl: this.buildTabElement(id, tabTitle),
      profileId: profile?.id || 'powershell',
      isZoomed: false,
      isCustomTitle: Boolean(customTitle)
    };

    // Terminal baslik degisimlerini sekme basligina yansit (eger ozel ad verilmediyse)
    leaf.terminal.onTitleChange((newTitle) => {
      this.handleTerminalTitle(tab, leaf.id, newTitle);
    });

    this.leavesByPtyId.set(leaf.id, { tab, leaf });
    this.tabs.push(tab);
    this.tabsById.set(tab.id, tab);

    this.renderTabPanes(tab);
    this.setActiveTab(tab.id);
    this.syncSession();
  }

  async requestCloseTab(id: string): Promise<void> {
    const tab = this.tabsById.get(id);
    if (!tab) return;

    if (this.settings?.terminal.confirmBeforeClose) {
      const leaves = collectLeaves(tab.root);
      if (leaves.length > 1 || this.tabs.length > 1) {
        const confirmed = await this.confirmModal?.confirm(
          'Close Tab',
          `Active terminal sessions in "${tab.title}" will be terminated. Are you sure?`,
          'Close Tab',
          true
        );
        if (!confirmed) return;
      }
    }

    this.closeTab(id);
  }

  async closeOtherTabs(keepId: string): Promise<void> {
    const otherTabs = this.tabs.filter((t) => t.id !== keepId);
    if (otherTabs.length === 0) return;

    if (this.settings?.terminal.confirmBeforeClose) {
      const confirmed = await this.confirmModal?.confirm(
        'Close Other Tabs',
        `${otherTabs.length} tab(s) will be closed. Are you sure?`,
        'Close Tabs',
        true
      );
      if (!confirmed) return;
    }

    for (const tab of otherTabs) {
      this.closeTab(tab.id);
    }
  }

  closeTab(id: string): void {
    const index = this.tabs.findIndex((tab) => tab.id === id);
    if (index === -1) return;

    const [tab] = this.tabs.splice(index, 1);
    this.tabsById.delete(id);

    for (const leaf of collectLeaves(tab.root)) {
      this.leavesByPtyId.delete(leaf.id);
      this.cwdTracker.clearLeaf(leaf.id);
      this.oscCwdLeaves.delete(leaf.id);
      disposePaneLeaf(leaf);
    }
    this.portSniffer.clearTab(id);
    tab.containerEl.remove();
    tab.tabEl.remove();

    if (this.tabs.length === 0) {
      this.sessionManager?.clearSession();
      window.bitig.windowControls.close();
      return;
    }

    if (this.activeId === id) {
      const fallback = this.tabs[Math.min(index, this.tabs.length - 1)];
      this.setActiveTab(fallback.id);
    }

    this.syncSession();
  }

  setActiveTab(id: string): void {
    if (id === this.activeId) return;

    const previous = this.activeId ? this.tabsById.get(this.activeId) : undefined;
    previous?.containerEl.classList.add('hidden');

    const next = this.tabsById.get(id);
    if (!next) return;

    next.containerEl.classList.remove('hidden');
    this.activeId = id;
    this.renderTabBar();

    for (const leaf of collectLeaves(next.root)) {
      leaf.fitAddon.fit();
      window.bitig.pty.resize(leaf.id, leaf.terminal.cols, leaf.terminal.rows);
    }
    this.refreshTitleFromActiveLeaf(next);
    this.focusTerminal(next, next.activeLeafId);
    this.syncStatusBar();
    this.syncSession();
  }

  /** Aktif sekmenin odakli pane'ini belirtilen yonde ikiye boler. */
  async splitActivePane(direction: SplitDirection, profileId?: string): Promise<void> {
    const tab = this.getActiveTab();
    if (!tab) return;

    // Zoom aktifse split oncesi zoom'dan cik
    if (tab.isZoomed) {
      tab.isZoomed = false;
    }

    const activeLeaf = findLeaf(tab.root, tab.activeLeafId);
    const profile = this.getProfileById(profileId || tab.profileId);
    let ptyId = '';
    const options: CreatePaneLeafOptions = {
      command: profile?.command,
      args: profile?.args,
      cwd: activeLeaf?.cwd || profile?.startingDirectory,
      copyOnSelect: this.settings?.terminal.copyOnSelect,
      pasteOnRightClick: this.settings?.terminal.pasteOnRightClick,
      scrollback: this.settings?.terminal.scrollback,
      onInput: (data) => this.telemetry.handleTerminalInput(ptyId, data),
      onWrite: (leafId, data) => this.handleLeafWrite(leafId, data),
      onContextMenu: (event, leaf) => this.handlePaneContextMenu(event, leaf),
      onCursorMove: (line, col) => this.statusBar?.updateCursor(line, col),
      onCwdChange: (leafId, newCwd) => this.handleCwdChange(leafId, newCwd, true),
      inlineSuggestions: this.createSuggestions(() => ptyId)
    };

    const newLeaf = await createPaneLeaf(
      (event) => this.keybindings.isReserved(event),
      this.currentTerminalTheme,
      this.currentFont,
      options
    );
    ptyId = newLeaf.id;

    newLeaf.terminal.onTitleChange((newTitle) => {
      this.handleTerminalTitle(tab, newLeaf.id, newTitle);
    });

    this.leavesByPtyId.set(newLeaf.id, { tab, leaf: newLeaf });

    tab.root = splitLeaf(tab.root, tab.activeLeafId, direction, newLeaf);
    tab.activeLeafId = newLeaf.id;
    this.renderTabPanes(tab);
    this.focusTerminal(tab, newLeaf.id);
    this.syncStatusBar();
  }

  closeActivePane(): void {
    const tab = this.getActiveTab();
    if (!tab) return;
    this.closePaneInTab(tab, tab.activeLeafId);
  }

  /** Aktif odakli pane'i tam ekran yapar veya eski split duzenine dondurur. */
  toggleZoomActivePane(): void {
    const tab = this.getActiveTab();
    if (!tab) return;
    const leaves = collectLeaves(tab.root);
    if (leaves.length < 2) return; // Tek pane varken zoom anlamsizdir

    tab.isZoomed = !tab.isZoomed;
    this.renderTabPanes(tab);

    const activeLeaf = findLeaf(tab.root, tab.activeLeafId);
    if (activeLeaf) {
      activeLeaf.fitAddon.fit();
      window.bitig.pty.resize(activeLeaf.id, activeLeaf.terminal.cols, activeLeaf.terminal.rows);
      this.focusTerminal(tab, activeLeaf.id);
    }
    this.updateTabElementZoom(tab);
    this.syncStatusBar();
  }

  /** Yonsel olarak komsu pane'e odaklanir. */
  navigateActivePane(direction: 'left' | 'right' | 'up' | 'down'): void {
    const tab = this.getActiveTab();
    if (!tab || tab.isZoomed) return;

    const targetId = navigateDirection(tab.root, tab.activeLeafId, direction);
    if (targetId) {
      this.focusLeaf(tab, targetId);
    }
  }

  /** Aktif terminalde arama cubugunu acar/kapatir. */
  toggleSearch(): void {
    const tab = this.getActiveTab();
    if (!tab) return;
    const leaf = findLeaf(tab.root, tab.activeLeafId);
    if (leaf) {
      this.searchBar.toggle(leaf.terminal, leaf.searchAddon);
    }
  }

  /** Aktif odakli pane'in PTY oturumuna veri/komut gonderir.
   *  Broadcast modu aktifse aktif sekmedeki TUM pane'lere yazar. */
  writeToActivePane(text: string): void {
    const tab = this.getActiveTab();
    if (!tab) return;

    if (this.isBroadcast) {
      const leaves = collectLeaves(tab.root);
      for (const leaf of leaves) {
        window.bitig.pty.write(leaf.id, text);
      }
      const activeLeaf = findLeaf(tab.root, tab.activeLeafId);
      if (activeLeaf) {
        this.telemetry.startCommand(activeLeaf.id, text.replace(/[\r\n]+$/, ''));
        activeLeaf.terminal.focus();
      }
    } else {
      const leaf = findLeaf(tab.root, tab.activeLeafId);
      if (leaf) {
        this.telemetry.startCommand(leaf.id, text.replace(/[\r\n]+$/, ''));
        window.bitig.pty.write(leaf.id, text);
        leaf.terminal.focus();
      }
    }
  }

  private handleLeafWrite(leafId: string, data: string): void {
    if (this.isBroadcast && this.activeId) {
      const activeTab = this.tabsById.get(this.activeId);
      if (activeTab) {
        const leaves = collectLeaves(activeTab.root);
        for (const leaf of leaves) {
          window.bitig.pty.write(leaf.id, data);
        }
        return;
      }
    }
    window.bitig.pty.write(leafId, data);
  }

  /** Broadcast Input modunu acar veya kapatir (Alt+Shift+I). */
  toggleBroadcast(): void {
    this.isBroadcast = !this.isBroadcast;
    this.broadcastBanner.classList.toggle('active', this.isBroadcast);
    document.body.classList.toggle('broadcast-active', this.isBroadcast);
    this.syncStatusBar();
  }

  isBroadcastActive(): boolean {
    return this.isBroadcast;
  }

  getActiveShellContext(): { shellType: string; cwd?: string } {
    const tab = this.getActiveTab();
    const profile = this.getProfileById(tab?.profileId);
    const leaf = tab ? findLeaf(tab.root, tab.activeLeafId) : undefined;
    return { shellType: profile?.name || 'PowerShell', cwd: leaf?.cwd };
  }

  getTabsInfo(): { id: string; title: string; active: boolean }[] {
    return this.tabs.map((tab) => ({
      id: tab.id,
      title: tab.title,
      active: tab.id === this.activeId
    }));
  }

  switchToTab(id: string): void {
    this.setActiveTab(id);
  }

  applyTerminalTheme(theme: ITheme): void {
    this.currentTerminalTheme = theme;
    for (const tab of this.tabs) {
      for (const leaf of collectLeaves(tab.root)) {
        leaf.terminal.options.theme = theme;
      }
    }
  }

  applyTerminalFont(font: TerminalFontOptions): void {
    this.currentFont = font;
    for (const tab of this.tabs) {
      for (const leaf of collectLeaves(tab.root)) {
        leaf.terminal.options.fontFamily = font.fontFamily;
        leaf.terminal.options.fontSize = font.fontSize;
        if (leaf.container.clientWidth === 0 || leaf.container.clientHeight === 0) continue;
        leaf.fitAddon.fit();
        window.bitig.pty.resize(leaf.id, leaf.terminal.cols, leaf.terminal.rows);
      }
    }
  }

  disposeAll(): void {
    for (const tab of this.tabs) {
      for (const leaf of collectLeaves(tab.root)) {
        window.bitig.pty.dispose(leaf.id);
      }
    }
  }

  private handlePaneContextMenu(event: MouseEvent, leaf: PaneLeaf): void {
    if (!this.contextMenu) return;

    const hasSelection = leaf.terminal.hasSelection();
    const items: ContextMenuItem[] = [
      {
        id: 'copy',
        label: 'Copy',
        icon: icon('copy'),
        shortcut: 'Ctrl+Shift+C',
        disabled: !hasSelection,
        action: () => {
          const text = leaf.terminal.getSelection();
          if (text) void navigator.clipboard.writeText(text);
        }
      },
      {
        id: 'paste',
        label: 'Paste',
        icon: icon('paste'),
        shortcut: 'Ctrl+Shift+V',
        action: () => {
          void navigator.clipboard.readText().then((text) => {
            if (text) leaf.terminal.paste(text);
          });
        }
      },
      { id: 'separator', label: '', action: () => {} },
      {
        id: 'split-right',
        label: 'Split Right',
        icon: icon('splitH'),
        shortcut: 'Ctrl+Shift+E',
        action: () => void this.splitActivePane('row')
      },
      {
        id: 'split-down',
        label: 'Split Down',
        icon: icon('splitV'),
        shortcut: 'Ctrl+Shift+O',
        action: () => void this.splitActivePane('column')
      },
      {
        id: 'zoom',
        label: this.getActiveTab()?.isZoomed ? 'Restore Pane' : 'Zoom Pane',
        icon: icon('expand'),
        shortcut: 'Ctrl+Shift+Z',
        action: () => this.toggleZoomActivePane()
      },
      { id: 'separator', label: '', action: () => {} },
      {
        id: 'search',
        label: 'Search Terminal',
        icon: icon('search'),
        shortcut: 'Ctrl+F',
        action: () => this.toggleSearch()
      },
      {
        id: 'clear',
        label: 'Clear Buffer',
        icon: icon('eraser'),
        shortcut: 'Ctrl+L',
        action: () => leaf.terminal.clear()
      },
      { id: 'separator', label: '', action: () => {} },
      {
        id: 'bilge',
        label: 'Ask Bilge AI',
        icon: icon('sparkle'),
        shortcut: 'Ctrl+I',
        action: () => this.onOpenBilge?.()
      }
    ];

    this.contextMenu.show(event.clientX, event.clientY, items);
  }

  private handleTabContextMenu(event: MouseEvent, tab: Tab): void {
    if (!this.contextMenu) return;
    event.preventDefault();
    event.stopPropagation();

    const items: ContextMenuItem[] = [
      {
        id: 'rename',
        label: 'Rename Tab',
        icon: icon('pencil'),
        action: () => this.startInlineRename(tab)
      },
      {
        id: 'new-window',
        label: 'New Window',
        icon: icon('plus'),
        shortcut: 'Ctrl+Shift+N',
        action: () => window.bitig.windowControls.newWindow()
      },
      {
        id: 'split-right',
        label: 'Split Right',
        icon: icon('splitH'),
        shortcut: 'Ctrl+Shift+E',
        action: () => {
          this.setActiveTab(tab.id);
          void this.splitActivePane('row');
        }
      },
      {
        id: 'split-down',
        label: 'Split Down',
        icon: icon('splitV'),
        shortcut: 'Ctrl+Shift+O',
        action: () => {
          this.setActiveTab(tab.id);
          void this.splitActivePane('column');
        }
      },
      { id: 'separator', label: '', action: () => {} },
      {
        id: 'close',
        label: 'Close Tab',
        icon: icon('x'),
        shortcut: 'Ctrl+Shift+W',
        action: () => void this.requestCloseTab(tab.id)
      },
      {
        id: 'close-others',
        label: 'Close Other Tabs',
        icon: icon('ban'),
        disabled: this.tabs.length <= 1,
        action: () => void this.closeOtherTabs(tab.id)
      }
    ];

    this.contextMenu.show(event.clientX, event.clientY, items);
  }

  private startInlineRename(tab: Tab): void {
    const titleEl = tab.tabEl.querySelector('.tab-title') as HTMLElement | null;
    if (!titleEl) return;

    const currentTitle = tab.title;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'tab-title-input';
    input.value = currentTitle;

    titleEl.replaceWith(input);
    input.focus();
    input.select();

    const finishRename = (): void => {
      const newTitle = input.value.trim() || currentTitle;
      tab.title = newTitle;
      tab.isCustomTitle = true;
      const newTitleEl = document.createElement('span');
      newTitleEl.className = 'tab-title';
      newTitleEl.textContent = newTitle;
      input.replaceWith(newTitleEl);
      this.syncStatusBar();
      this.syncSession();
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        input.blur();
      } else if (e.key === 'Escape') {
        input.value = currentTitle;
        input.blur();
      }
    });

    input.addEventListener('blur', finishRename, { once: true });
  }

  /** Her pane icin bir ghost-text oneri katmani uretir (ayarla kapatilabilir). */
  private createSuggestions(getPtyId: () => string): InlineSuggestions | undefined {
    if (this.settings?.terminal.inlineSuggestions === false) return undefined;
    return new InlineSuggestions({
      getCwd: () => {
        const entry = this.leavesByPtyId.get(getPtyId());
        return entry?.leaf.cwd;
      }
    });
  }

  /**
   * Kabuktan gelen OSC 0/2 basligi. PowerShell/cmd acilista baslik olarak
   * calistirilan exe'nin TAM YOLUNU yayar ("C:\WINDOWS\System32\...\powershell.exe")
   * - bu, sekmenin "system32" gibi anlamsiz bir isimde takili kalmasinin
   * sebebiydi. Bu tur basliklari yok sayip CWD tabanli baslige birakiyoruz.
   */
  private handleTerminalTitle(tab: Tab, leafId: string, rawTitle: string): void {
    if (tab.isCustomTitle) return;
    if (tab.activeLeafId !== leafId) return;
    const title = rawTitle?.trim();
    if (!title) return;
    // Acilista yayilan exe yolu basligi ("C:\WINDOWS\System32\...\powershell.exe")
    // sekmenin "system32" gibi anlamsiz bir isimde takili kalmasina sebep oluyordu.
    if (/[\\/]/.test(title) && /\.(exe|com|bat|cmd)$/i.test(title)) return;
    // Calisma dizini biliniyorsa klasor adi otoritedir: oh-my-posh/starship gibi
    // temalar baslik olarak son komutu yayar, kullanici ise sekmede bulundugu
    // klasoru gormek ister.
    if (this.leavesByPtyId.get(leafId)?.leaf.cwd) return;
    this.updateTabTitle(tab, title);
  }

  /** OSC 7/9 ya da prompt sezgisiyle gelen yeni calisma dizinini isler. */
  private handleCwdChange(leafId: string, cwd: string, fromOsc: boolean): void {
    const entry = this.leavesByPtyId.get(leafId);
    if (!entry) return;
    if (fromOsc) this.oscCwdLeaves.add(leafId);
    entry.leaf.cwd = cwd;

    if (entry.tab.activeLeafId !== leafId) return;
    if (!entry.tab.isCustomTitle) {
      this.updateTabTitle(entry.tab, folderNameOf(cwd));
    }
    entry.tab.tabEl.title = cwd;
    if (entry.tab.id === this.activeId) this.syncStatusBar();
  }

  /** Aktif pane degisince sekme basligini o pane'in dizinine gore tazeler. */
  private refreshTitleFromActiveLeaf(tab: Tab): void {
    if (tab.isCustomTitle) return;
    const leaf = findLeaf(tab.root, tab.activeLeafId);
    if (!leaf?.cwd) return;
    this.updateTabTitle(tab, folderNameOf(leaf.cwd));
    tab.tabEl.title = leaf.cwd;
  }

  private updateTabTitle(tab: Tab, title: string): void {
    tab.title = title;
    const titleEl = tab.tabEl.querySelector('.tab-title');
    if (titleEl) {
      titleEl.textContent = title;
    }
    if (tab.id === this.activeId) {
      this.syncStatusBar();
    }
    this.syncSession();
  }

  private updateTabElementZoom(tab: Tab): void {
    const zoomBadge = tab.tabEl.querySelector('.tab-zoom-badge');
    if (tab.isZoomed) {
      if (!zoomBadge) {
        const badgeEl = document.createElement('span');
        badgeEl.className = 'tab-zoom-badge';
        badgeEl.innerHTML = icon('expand');
        badgeEl.title = 'Pane zoomed (Ctrl+Shift+Z)';
        tab.tabEl.insertBefore(badgeEl, tab.tabEl.querySelector('.tab-close'));
      }
    } else {
      zoomBadge?.remove();
    }
  }

  private updateTabPorts(tabId: string, ports: DiscoveredPort[]): void {
    const tab = this.tabsById.get(tabId);
    if (!tab) return;

    let portsContainer = tab.tabEl.querySelector('.tab-ports-container') as HTMLElement | null;
    if (ports.length === 0) {
      portsContainer?.remove();
      return;
    }

    if (!portsContainer) {
      portsContainer = document.createElement('span');
      portsContainer.className = 'tab-ports-container';
      tab.tabEl.insertBefore(portsContainer, tab.tabEl.querySelector('.tab-close'));
    }

    portsContainer.replaceChildren();
    for (const p of ports) {
      const badge = document.createElement('span');
      badge.className = 'tab-port-badge';
      badge.title = `Open ${p.url} in browser`;
      badge.innerHTML = `<span class="tab-port-dot"></span>:${p.port}`;
      badge.addEventListener('click', (e) => {
        e.stopPropagation();
        void window.bitig.cockpit.openUrl(p.url);
      });
      portsContainer.appendChild(badge);
    }
  }

  private closePaneInTab(tab: Tab, leafId: string): void {
    const leaf = findLeaf(tab.root, leafId);
    if (!leaf) return;

    const newRoot = closeLeafFromTree(tab.root, leafId);
    this.leavesByPtyId.delete(leafId);
    this.portSniffer.clearLeaf(leafId);
    this.cwdTracker.clearLeaf(leafId);
    this.oscCwdLeaves.delete(leafId);
    disposePaneLeaf(leaf);

    if (newRoot === null) {
      this.closeTab(tab.id);
      return;
    }

    tab.root = newRoot;
    if (collectLeaves(newRoot).length < 2) {
      tab.isZoomed = false;
    }
    if (tab.activeLeafId === leafId) {
      tab.activeLeafId = collectLeaves(newRoot)[0].id;
    }
    this.renderTabPanes(tab);
    this.focusTerminal(tab, tab.activeLeafId);
    this.syncStatusBar();
  }

  private focusLeaf(tab: Tab, leafId: string): void {
    if (tab.activeLeafId !== leafId) {
      tab.activeLeafId = leafId;
      this.renderTabPanes(tab);
      this.refreshTitleFromActiveLeaf(tab);
    }
    this.focusTerminal(tab, leafId);
    this.syncStatusBar();
  }

  private focusTerminal(tab: Tab, leafId: string): void {
    findLeaf(tab.root, leafId)?.terminal.focus();
  }

  private renderTabPanes(tab: Tab): void {
    const leaves = collectLeaves(tab.root);
    const highlightActive = leaves.length > 1 && !tab.isZoomed;
    const dom = renderPaneTree(
      tab.root,
      tab.activeLeafId,
      highlightActive,
      (leafId) => this.focusLeaf(tab, leafId),
      tab.isZoomed
    );
    tab.containerEl.replaceChildren(dom);
  }

  private getActiveTab(): Tab | undefined {
    return this.activeId ? this.tabsById.get(this.activeId) : undefined;
  }

  private cycleTab(direction: 1 | -1): void {
    if (this.tabs.length < 2) return;
    const currentIndex = this.tabs.findIndex((tab) => tab.id === this.activeId);
    const nextIndex = (currentIndex + direction + this.tabs.length) % this.tabs.length;
    this.setActiveTab(this.tabs[nextIndex].id);
  }

  private reorderTabs(draggedId: string, targetId: string): void {
    const fromIndex = this.tabs.findIndex((tab) => tab.id === draggedId);
    const toIndex = this.tabs.findIndex((tab) => tab.id === targetId);
    if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return;

    const [moved] = this.tabs.splice(fromIndex, 1);
    this.tabs.splice(toIndex, 0, moved);
    this.renderTabBar();
    this.syncSession();
  }

  private renderTabBar(): void {
    for (const tab of this.tabs) {
      this.tabbarListEl.appendChild(tab.tabEl);
      tab.tabEl.classList.toggle('active', tab.id === this.activeId);
    }
  }

  private syncStatusBar(): void {
    if (!this.statusBar) return;
    const tab = this.getActiveTab();
    if (!tab) return;

    const profile = this.getProfileById(tab.profileId);
    this.statusBar.updateProfile(profile?.name || tab.title, profile?.color);

    const leaves = collectLeaves(tab.root);
    const activeIndex = leaves.findIndex((l) => l.id === tab.activeLeafId);
    this.statusBar.updatePanes(Math.max(0, activeIndex), leaves.length, tab.isZoomed);
    this.statusBar.updateBroadcast(this.isBroadcast);

    const ports = this.portSniffer.getPortsForTab(tab.id).map((p) => p.port);
    this.statusBar.updatePorts(ports);
  }

  private syncSession(): void {
    if (!this.settings?.terminal.restoreSession || !this.sessionManager) return;
    const activeIndex = this.tabs.findIndex((t) => t.id === this.activeId);
    const savedTabs = this.tabs.map((t) => {
      const leaf = findLeaf(t.root, t.activeLeafId);
      return {
        profileId: t.profileId,
        title: t.title,
        cwd: leaf?.cwd
      };
    });
    this.sessionManager.saveSession(savedTabs, activeIndex);
  }

  private buildTabElement(id: string, initialTitle: string): HTMLButtonElement {
    const tabEl = document.createElement('button');
    tabEl.className = 'tab';
    tabEl.setAttribute('role', 'tab');
    tabEl.draggable = true;

    const titleEl = document.createElement('span');
    titleEl.className = 'tab-title';
    titleEl.textContent = initialTitle;
    titleEl.title = 'Double-click to rename';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'tab-close';
    closeBtn.title = 'Close tab';
    closeBtn.setAttribute('aria-label', 'Close tab');
    closeBtn.innerHTML = '<svg viewBox="0 0 10 10"><path d="M0 0l10 10M10 0L0 10" /></svg>';

    tabEl.append(titleEl, closeBtn);

    tabEl.addEventListener('click', () => this.setActiveTab(id));
    
    // Cift tiklama ile sekme adlandirma
    titleEl.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      const tab = this.tabsById.get(id);
      if (tab) this.startInlineRename(tab);
    });

    // Sekmeye sag tiklama menusu
    tabEl.addEventListener('contextmenu', (event) => {
      const tab = this.tabsById.get(id);
      if (tab) this.handleTabContextMenu(event, tab);
    });

    closeBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      void this.requestCloseTab(id);
    });

    tabEl.addEventListener('mousedown', (event) => {
      if (event.button === 1) event.preventDefault();
    });
    tabEl.addEventListener('auxclick', (event) => {
      if (event.button === 1) {
        event.preventDefault();
        void this.requestCloseTab(id);
      }
    });

    tabEl.addEventListener('dragstart', (event) => {
      event.dataTransfer?.setData('text/plain', id);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    });
    tabEl.addEventListener('dragover', (event) => {
      event.preventDefault();
      tabEl.classList.add('drag-over');
    });
    tabEl.addEventListener('dragleave', () => tabEl.classList.remove('drag-over'));
    tabEl.addEventListener('drop', (event) => {
      event.preventDefault();
      tabEl.classList.remove('drag-over');
      const draggedId = event.dataTransfer?.getData('text/plain');
      if (draggedId) this.reorderTabs(draggedId, id);
    });

    return tabEl;
  }
}
