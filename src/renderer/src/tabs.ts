import {
  closeLeafFromTree,
  collectLeaves,
  createPaneLeaf,
  disposePaneLeaf,
  findLeaf,
  renderPaneTree,
  splitLeaf,
  type PaneLeaf,
  type PaneNode,
  type SplitDirection
} from './panes';

interface Tab {
  id: string; // istemci tarafinda uretilir (crypto.randomUUID); artik bir
  // PTY id'si degil, cunku bir sekme birden fazla pane (ve dolayisiyla
  // birden fazla PTY oturumu) barindirabilir.
  title: string;
  root: PaneNode;
  activeLeafId: string; // sekme icinde odakli olan pane'in PTY id'si
  containerEl: HTMLDivElement;
  tabEl: HTMLButtonElement;
}

/**
 * Birden fazla bagimsiz sekmeyi yonetir; her sekme kendi pane agacina
 * (split edilebilir bir veya daha fazla terminal) sahiptir. PTY olaylari
 * (pty:data/pty:exit) tek bir global dinleyiciden PTY id'sine gore ilgili
 * pane'e yonlendirilir; sekme ya da pane basina ayri dinleyici kaydedilmez.
 */
export class TabStore {
  private readonly tabs: Tab[] = [];
  private readonly tabsById = new Map<string, Tab>();
  private readonly leavesByPtyId = new Map<string, { tab: Tab; leaf: PaneLeaf }>();
  private activeId: string | null = null;

  constructor(
    private readonly rootEl: HTMLElement,
    private readonly tabbarListEl: HTMLElement
  ) {
    window.bitig.pty.onData((event) => {
      this.leavesByPtyId.get(event.id)?.leaf.terminal.write(event.data);
    });

    window.bitig.pty.onExit((event) => {
      const entry = this.leavesByPtyId.get(event.id);
      entry?.leaf.terminal.write(`\r\n[proses sonlandi, exit code: ${event.exitCode}]\r\n`);
    });

    window.addEventListener('keydown', (event) => this.handleGlobalKeydown(event));
  }

  async createTab(): Promise<void> {
    const leaf = await createPaneLeaf((event) => this.isReservedShortcut(event));

    const containerEl = document.createElement('div');
    containerEl.className = 'tab-pane hidden';
    this.rootEl.appendChild(containerEl);

    const id = crypto.randomUUID();
    const tab: Tab = {
      id,
      title: 'PowerShell',
      root: leaf,
      activeLeafId: leaf.id,
      containerEl,
      tabEl: this.buildTabElement(id)
    };

    this.leavesByPtyId.set(leaf.id, { tab, leaf });
    this.tabs.push(tab);
    this.tabsById.set(tab.id, tab);

    this.renderTabPanes(tab);
    // setActiveTab kendi icinde renderTabBar() cagirir; DOM'a yeni eklenen
    // tabEl bu cagri sirasinda #tabbar-list'e tasinir.
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
    tab.containerEl.remove();
    tab.tabEl.remove();

    if (this.tabs.length === 0) {
      // Son sekme kapaninca Windows Terminal'deki gibi tum pencere kapanir.
      window.bitig.windowControls.close();
      return;
    }

    if (this.activeId === id) {
      // Kapatilan sekme aktifti; komsu sekmeye gec (setActiveTab kendi
      // icinde renderTabBar() cagirir).
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

    // container az once gorunur oldu. Her leaf'in kendi ResizeObserver'i
    // bunu genelde yakalar, ama display:none -> block gecisinde tarayicilar
    // arasi tutarlilik icin burada da acikca fit()+resize cagiriyoruz.
    for (const leaf of collectLeaves(next.root)) {
      leaf.fitAddon.fit();
      window.bitig.pty.resize(leaf.id, leaf.terminal.cols, leaf.terminal.rows);
    }
    this.focusTerminal(next, next.activeLeafId);
  }

  /** Aktif sekmenin odakli pane'ini belirtilen yonde ikiye boler. */
  async splitActivePane(direction: SplitDirection): Promise<void> {
    const tab = this.getActiveTab();
    if (!tab) return;

    const newLeaf = await createPaneLeaf((event) => this.isReservedShortcut(event));
    this.leavesByPtyId.set(newLeaf.id, { tab, leaf: newLeaf });

    tab.root = splitLeaf(tab.root, tab.activeLeafId, direction, newLeaf);
    tab.activeLeafId = newLeaf.id;
    this.renderTabPanes(tab);
    this.focusTerminal(tab, newLeaf.id);
  }

  /** Aktif sekmenin odakli pane'ini kapatir; son pane ise sekmenin tumu kapanir. */
  closeActivePane(): void {
    const tab = this.getActiveTab();
    if (!tab) return;
    this.closePaneInTab(tab, tab.activeLeafId);
  }

  /** beforeunload sirasinda tum sekmelerdeki tum PTY oturumlarini sonlandirir. */
  disposeAll(): void {
    for (const tab of this.tabs) {
      for (const leaf of collectLeaves(tab.root)) {
        window.bitig.pty.dispose(leaf.id);
      }
    }
  }

  private closePaneInTab(tab: Tab, leafId: string): void {
    const leaf = findLeaf(tab.root, leafId);
    if (!leaf) return;

    const newRoot = closeLeafFromTree(tab.root, leafId);
    this.leavesByPtyId.delete(leafId);
    disposePaneLeaf(leaf);

    if (newRoot === null) {
      // Sekmenin son pane'i kapandi; sekmenin kendisini kapat.
      this.closeTab(tab.id);
      return;
    }

    tab.root = newRoot;
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
    // Birden fazla pane varken odakli olani ince bir kenarlikla belirt;
    // tek pane varken bu vurgu gereksiz gorsel gurultu olur.
    const highlightActive = collectLeaves(tab.root).length > 1;
    const dom = renderPaneTree(tab.root, tab.activeLeafId, highlightActive, (leafId) =>
      this.focusLeaf(tab, leafId)
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
      // appendChild zaten DOM'da olan bir node'u tasir (klonlamaz), bu
      // yuzden bu tam-yeniden-cizim her seferinde event listener'lari
      // korur ve sirayi this.tabs dizisiyle senkron tutar.
      this.tabbarListEl.appendChild(tab.tabEl);
      tab.tabEl.classList.toggle('active', tab.id === this.activeId);
    }
  }

  private buildTabElement(id: string): HTMLButtonElement {
    const tabEl = document.createElement('button');
    tabEl.className = 'tab';
    tabEl.setAttribute('role', 'tab');
    tabEl.draggable = true;

    const titleEl = document.createElement('span');
    titleEl.className = 'tab-title';
    titleEl.textContent = 'PowerShell';

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

    // Orta tus (tekerlek) tikla kapatma: tarayicilarin standart sekme
    // davranisi. mousedown'da preventDefault olmazsa Windows'ta orta tik
    // otomatik kaydirma (autoscroll) imlecini tetikler.
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

  private handleGlobalKeydown(event: KeyboardEvent): void {
    const key = event.key.toLowerCase();

    if (event.ctrlKey && event.shiftKey && key === 't') {
      event.preventDefault();
      void this.createTab();
      return;
    }

    if (event.ctrlKey && event.shiftKey && key === 'w') {
      event.preventDefault();
      if (this.activeId) this.closeTab(this.activeId);
      return;
    }

    if (event.ctrlKey && event.shiftKey && key === 'x') {
      event.preventDefault();
      this.closeActivePane();
      return;
    }

    if (event.ctrlKey && key === 'tab') {
      event.preventDefault();
      this.cycleTab(event.shiftKey ? -1 : 1);
      return;
    }

    if (event.altKey && event.shiftKey && key === 'd') {
      event.preventDefault();
      void this.splitActivePane('row');
      return;
    }

    if (event.altKey && event.shiftKey && key === 'e') {
      event.preventDefault();
      void this.splitActivePane('column');
    }
  }

  // handleGlobalKeydown ile birebir ayni kosullari kontrol eder: sadece
  // gercekten bir uygulama kisayolu olarak islenen kombinasyonlar burada
  // true donmeli, yoksa ör. duz Ctrl+T gibi gercek bir shell kontrol
  // karakteri sessizce yutulur.
  private isReservedShortcut(event: KeyboardEvent): boolean {
    if (event.type !== 'keydown') return false;
    const key = event.key.toLowerCase();

    if (event.ctrlKey && key === 'tab') return true;
    if (event.ctrlKey && event.shiftKey && (key === 't' || key === 'w' || key === 'x')) return true;
    if (event.altKey && event.shiftKey && (key === 'd' || key === 'e')) return true;
    return false;
  }
}
