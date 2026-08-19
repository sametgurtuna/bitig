import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { BITIG_TERMINAL_THEME } from './theme';

interface Tab {
  id: string;
  title: string;
  terminal: Terminal;
  fitAddon: FitAddon;
  container: HTMLDivElement;
  tabEl: HTMLButtonElement;
}

/**
 * Birden fazla bagimsiz terminal oturumunu (sekme) yonetir: her sekme kendi
 * xterm.js instance'ina ve kendi PTY oturumuna sahiptir. PTY olaylari
 * (pty:data/pty:exit) tek bir global dinleyiciden id'ye gore ilgili sekmeye
 * yonlendirilir; sekme basina ayri dinleyici kaydedilmez.
 */
export class TabStore {
  private readonly tabs: Tab[] = [];
  private readonly tabsById = new Map<string, Tab>();
  private activeId: string | null = null;

  constructor(
    private readonly rootEl: HTMLElement,
    private readonly tabbarListEl: HTMLElement
  ) {
    window.bitig.pty.onData((event) => {
      this.tabsById.get(event.id)?.terminal.write(event.data);
    });

    window.bitig.pty.onExit((event) => {
      const tab = this.tabsById.get(event.id);
      tab?.terminal.write(`\r\n[proses sonlandi, exit code: ${event.exitCode}]\r\n`);
    });

    window.addEventListener('resize', () => this.fitActiveTab());
    window.addEventListener('keydown', (event) => this.handleGlobalKeydown(event));
  }

  async createTab(): Promise<void> {
    // Terminal'i olcmeden once makul bir varsayilanla PTY baslatiyoruz;
    // DOM'a monte edip fit() cagirdiktan hemen sonra gercek boyuta resize
    // ediyoruz. Boylece "olcum icin once gorunur olmali, gorunur olmak
    // icin once id lazim" dongusune girmiyoruz.
    const { id } = await window.bitig.pty.create({ cols: 80, rows: 24 });

    const container = document.createElement('div');
    container.className = 'tab-pane hidden';
    this.rootEl.appendChild(container);

    const terminal = new Terminal({
      cursorBlink: true,
      cursorStyle: 'bar',
      fontFamily: "'Cascadia Code', 'Cascadia Mono', Consolas, monospace",
      fontSize: 14,
      lineHeight: 1.25,
      scrollback: 5000,
      theme: BITIG_TERMINAL_THEME
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(new WebLinksAddon());
    terminal.open(container);

    // Sekme kisayollari (Ctrl+Shift+T/W, Ctrl+Tab) shell'e karakter olarak
    // gitmesin; xterm bu kombinasyonlari kendi islemesin diye false donuyoruz.
    terminal.attachCustomKeyEventHandler((event) => !this.isReservedShortcut(event));

    terminal.onData((data) => window.bitig.pty.write(id, data));

    const tab: Tab = {
      id,
      title: 'PowerShell',
      terminal,
      fitAddon,
      container,
      tabEl: this.buildTabElement(id)
    };

    this.tabs.push(tab);
    this.tabsById.set(id, tab);

    // setActiveTab kendi icinde renderTabBar() cagirir; DOM'a yeni eklenen
    // tabEl bu cagri sirasinda #tabbar-list'e tasinir.
    this.setActiveTab(id);
  }

  closeTab(id: string): void {
    const index = this.tabs.findIndex((tab) => tab.id === id);
    if (index === -1) return;

    const [tab] = this.tabs.splice(index, 1);
    this.tabsById.delete(id);
    window.bitig.pty.dispose(id);
    tab.terminal.dispose();
    tab.container.remove();
    tab.tabEl.remove();

    if (this.tabs.length === 0) {
      // Son sekme kapaninca Windows Terminal'deki gibi tum pencere kapanir.
      window.bitig.windowControls.close();
      return;
    }

    if (this.activeId === id) {
      // Kapatilan sekme aktifti; komsu sekmeye gec (setActiveTab kendi
      // icinde renderTabBar() cagirir). Aktif olmayan bir sekme kapandiginda
      // tab bar'in aktif-sinif durumu degismedigi icin ekstra render
      // gerekmez, eleman zaten yukarida .remove() ile DOM'dan cikarildi.
      const fallback = this.tabs[Math.min(index, this.tabs.length - 1)];
      this.setActiveTab(fallback.id);
    }
  }

  setActiveTab(id: string): void {
    if (id === this.activeId) return;

    const previous = this.activeId ? this.tabsById.get(this.activeId) : undefined;
    previous?.container.classList.add('hidden');

    const next = this.tabsById.get(id);
    if (!next) return;

    next.container.classList.remove('hidden');
    this.activeId = id;
    this.renderTabBar();

    // container az once gorunur oldu; fit() clientWidth/Height okurken
    // tarayici gerekli reflow'u senkron olarak yapar.
    next.fitAddon.fit();
    window.bitig.pty.resize(id, next.terminal.cols, next.terminal.rows);
    next.terminal.focus();
  }

  /** beforeunload sirasinda tum sekmelerin PTY oturumlarini sonlandirir. */
  disposeAll(): void {
    for (const tab of this.tabs) {
      window.bitig.pty.dispose(tab.id);
    }
  }

  private cycleTab(direction: 1 | -1): void {
    if (this.tabs.length < 2) return;
    const currentIndex = this.tabs.findIndex((tab) => tab.id === this.activeId);
    const nextIndex = (currentIndex + direction + this.tabs.length) % this.tabs.length;
    this.setActiveTab(this.tabs[nextIndex].id);
  }

  private fitActiveTab(): void {
    const active = this.activeId ? this.tabsById.get(this.activeId) : undefined;
    if (!active) return;
    active.fitAddon.fit();
    window.bitig.pty.resize(active.id, active.terminal.cols, active.terminal.rows);
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
    if (!event.ctrlKey) return;
    const key = event.key.toLowerCase();

    if (event.shiftKey && key === 't') {
      event.preventDefault();
      void this.createTab();
      return;
    }

    if (event.shiftKey && key === 'w') {
      event.preventDefault();
      if (this.activeId) this.closeTab(this.activeId);
      return;
    }

    if (key === 'tab') {
      event.preventDefault();
      this.cycleTab(event.shiftKey ? -1 : 1);
    }
  }

  // handleGlobalKeydown ile birebir ayni kosullari kontrol eder: sadece
  // gercekten sekme kisayolu olarak islenen kombinasyonlar burada true
  // donmeli, yoksa ör. duz Ctrl+T gibi gercek bir shell kontrol karakteri
  // sessizce yutulur.
  private isReservedShortcut(event: KeyboardEvent): boolean {
    if (event.type !== 'keydown' || !event.ctrlKey) return false;
    const key = event.key.toLowerCase();
    if (key === 'tab') return true;
    return event.shiftKey && (key === 't' || key === 'w');
  }
}
