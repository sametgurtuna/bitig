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
import type { DiscoveredPort } from '../../shared/cockpitTypes';

interface Tab {
  id: string;
  title: string;
  root: PaneNode;
  activeLeafId: string;
  containerEl: HTMLDivElement;
  tabEl: HTMLButtonElement;
  profileId: string;
  isZoomed: boolean;
}

/**
 * Sekmeleri, pane agaclarini ve klavye kisayollarini yoneten ana magaza.
 * Profil yonetimi, dahili arama, yonsel split gezinmesi ve zoom yeteneklerini barindirir.
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
  /** Broadcast Input modu aktif mi? Alt+Shift+I ile togglenir. */
  private isBroadcast = false;
  private readonly broadcastBanner: HTMLDivElement;

  constructor(
    private readonly rootEl: HTMLElement,
    private readonly tabbarListEl: HTMLElement,
    private readonly keybindings: KeybindingManager,
    telemetry?: ExecutionTelemetry,
    private readonly onCycleThemeShortcut?: () => void
  ) {
    this.searchBar = new SearchBar(this.rootEl);
    this.telemetry = telemetry || new ExecutionTelemetry();
    this.portSniffer = new PortSniffer();

    // Broadcast banner: window'un etrafina kirmizi cizgi + uyari mesaji
    this.broadcastBanner = document.createElement('div');
    this.broadcastBanner.id = 'broadcast-banner';
    this.broadcastBanner.innerHTML = '<span>🔴 BROADCAST AKTİF — tüm split pane\'lere yazılıyor</span>';
    document.body.appendChild(this.broadcastBanner);

    window.bitig.pty.onData((event) => {
      const entry = this.leavesByPtyId.get(event.id);
      entry?.leaf.terminal.write(event.data);
      this.telemetry.handleTerminalOutput(event.id, event.data);
      if (entry) {
        this.portSniffer.processOutput(entry.tab.id, entry.leaf.id, event.data);
      }
    });

    window.bitig.pty.onExit((event) => {
      const entry = this.leavesByPtyId.get(event.id);
      entry?.leaf.terminal.write(`\r\n[proses sonlandi, exit code: ${event.exitCode}]\r\n`);
      this.telemetry.finishCommand(event.id, event.exitCode);
    });

    this.portSniffer.onPortsChanged((ports, tabId) => {
      this.updateTabPorts(tabId, ports);
    });

    this.registerKeybindings();
  }

  private registerKeybindings(): void {
    this.keybindings.registerAction('tab.new', () => void this.createTab());
    this.keybindings.registerAction('tab.close', () => {
      if (this.activeId) this.closeTab(this.activeId);
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

  async createTab(profileId?: string, cwd?: string): Promise<void> {
    const profile = this.getProfileById(profileId);
    let ptyId = '';
    const options: CreatePaneLeafOptions = {
      command: profile?.command,
      args: profile?.args,
      cwd: cwd || profile?.startingDirectory,
      onInput: (data) => this.telemetry.handleTerminalInput(ptyId, data),
      onWrite: (leafId, data) => this.handleLeafWrite(leafId, data)
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
    const tabTitle = profile?.name || 'PowerShell';
    const tab: Tab = {
      id,
      title: tabTitle,
      root: leaf,
      activeLeafId: leaf.id,
      containerEl,
      tabEl: this.buildTabElement(id, tabTitle),
      profileId: profile?.id || 'powershell',
      isZoomed: false
    };

    // Terminal baslik degisimlerini sekme basligina yansit
    leaf.terminal.onTitleChange((newTitle) => {
      if (newTitle && newTitle.trim() !== '') {
        this.updateTabTitle(tab, newTitle.trim());
      }
    });

    this.leavesByPtyId.set(leaf.id, { tab, leaf });
    this.tabs.push(tab);
    this.tabsById.set(tab.id, tab);

    this.renderTabPanes(tab);
    this.setActiveTab(tab.id);
  }

  closeTab(id: string): void {
    const index = this.tabs.findIndex((tab) => tab.id === id);
    if (index === -1) return;

    const [tab] = this.tabs.splice(index, 1);
    this.tabsById.delete(id);

    for (const leaf of collectLeaves(tab.root)) {
      this.leavesByPtyId.delete(leaf.id);
      disposePaneLeaf(leaf);
    }
    this.portSniffer.clearTab(id);
    tab.containerEl.remove();
    tab.tabEl.remove();

    if (this.tabs.length === 0) {
      window.bitig.windowControls.close();
      return;
    }

    if (this.activeId === id) {
      const fallback = this.tabs[Math.min(index, this.tabs.length - 1)];
      this.setActiveTab(fallback.id);
    }
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
    this.focusTerminal(next, next.activeLeafId);
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
      onInput: (data) => this.telemetry.handleTerminalInput(ptyId, data),
      onWrite: (leafId, data) => this.handleLeafWrite(leafId, data)
    };

    const newLeaf = await createPaneLeaf(
      (event) => this.keybindings.isReserved(event),
      this.currentTerminalTheme,
      this.currentFont,
      options
    );
    ptyId = newLeaf.id;

    newLeaf.terminal.onTitleChange((newTitle) => {
      if (tab.activeLeafId === newLeaf.id && newTitle && newTitle.trim() !== '') {
        this.updateTabTitle(tab, newTitle.trim());
      }
    });

    this.leavesByPtyId.set(newLeaf.id, { tab, leaf: newLeaf });

    tab.root = splitLeaf(tab.root, tab.activeLeafId, direction, newLeaf);
    tab.activeLeafId = newLeaf.id;
    this.renderTabPanes(tab);
    this.focusTerminal(tab, newLeaf.id);
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
      // Broadcast: aktif sekmedeki tum leaf'lere ayni anda yaz
      const leaves = collectLeaves(tab.root);
      for (const leaf of leaves) {
        window.bitig.pty.write(leaf.id, text);
      }
      // Telemetry sadece aktif leaf icin
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

  /** Klavye basilmasi ile gelen veriyi yonlendirir; broadcast aktifse sekmedeki tum pane'lere iletir. */
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
  }

  /** Broadcast modunun aktif olup olmadigini doner. */
  isBroadcastActive(): boolean {
    return this.isBroadcast;
  }

  /** Acik sekmelerin id, baslik ve aktiflik durumlarini doner. */
  getTabsInfo(): { id: string; title: string; active: boolean }[] {
    return this.tabs.map((tab) => ({
      id: tab.id,
      title: tab.title,
      active: tab.id === this.activeId
    }));
  }

  /** Belirtilen sekmeye gecis yapar. */
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

  private updateTabTitle(tab: Tab, title: string): void {
    tab.title = title;
    const titleEl = tab.tabEl.querySelector('.tab-title');
    if (titleEl) {
      titleEl.textContent = title;
    }
  }

  private updateTabElementZoom(tab: Tab): void {
    const zoomBadge = tab.tabEl.querySelector('.tab-zoom-badge');
    if (tab.isZoomed) {
      if (!zoomBadge) {
        const badgeEl = document.createElement('span');
        badgeEl.className = 'tab-zoom-badge';
        badgeEl.textContent = '🔍';
        badgeEl.title = 'Pane buyutuldu (Ctrl+Shift+Z)';
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
      badge.title = `${p.url} tarayicida ac`;
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
  }

  private focusLeaf(tab: Tab, leafId: string): void {
    if (tab.activeLeafId !== leafId) {
      tab.activeLeafId = leafId;
      this.renderTabPanes(tab);
    }
    this.focusTerminal(tab, leafId);
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
  }

  private renderTabBar(): void {
    for (const tab of this.tabs) {
      this.tabbarListEl.appendChild(tab.tabEl);
      tab.tabEl.classList.toggle('active', tab.id === this.activeId);
    }
  }

  private buildTabElement(id: string, initialTitle: string): HTMLButtonElement {
    const tabEl = document.createElement('button');
    tabEl.className = 'tab';
    tabEl.setAttribute('role', 'tab');
    tabEl.draggable = true;

    const titleEl = document.createElement('span');
    titleEl.className = 'tab-title';
    titleEl.textContent = initialTitle;

    const closeBtn = document.createElement('button');
    closeBtn.className = 'tab-close';
    closeBtn.title = 'Kapat';
    closeBtn.setAttribute('aria-label', 'Sekmeyi kapat');
    closeBtn.innerHTML = '<svg viewBox="0 0 10 10"><path d="M0 0l10 10M10 0L0 10" /></svg>';

    tabEl.append(titleEl, closeBtn);

    tabEl.addEventListener('click', () => this.setActiveTab(id));
    closeBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      this.closeTab(id);
    });

    tabEl.addEventListener('mousedown', (event) => {
      if (event.button === 1) event.preventDefault();
    });
    tabEl.addEventListener('auxclick', (event) => {
      if (event.button === 1) {
        event.preventDefault();
        this.closeTab(id);
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
