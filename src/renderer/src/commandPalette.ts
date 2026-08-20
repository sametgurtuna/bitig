import { ACTION_DEFINITIONS } from '../../shared/actionTypes';
import { fuzzyScore } from './fuzzy';
import type { TabStore } from './tabs';
import type { AppearanceController } from './appearance';
import type { KeybindingManager } from './keybindings';
import type { PluginRuntime } from './pluginRuntime';

export interface PaletteItem {
  id: string;
  title: string;
  subtitle?: string;
  category: 'Actions' | 'Tabs' | 'Profiles' | 'Themes' | 'Betik';
  shortcut?: string;
  icon?: string;
  action: () => void | Promise<void>;
}

/**
 * Evrensel Komut Paleti (Ctrl+Shift+P):
 * Tum terminal eylemleri, sekmeler, profiller ve temalar arasinda fuzzy arama ve aninda calistirma saglar.
 */
export class CommandPalette {
  private isOpen = false;
  private readonly backdropEl: HTMLDivElement;
  private readonly modalEl: HTMLDivElement;
  private readonly inputEl: HTMLInputElement;
  private readonly listEl: HTMLDivElement;
  private items: PaletteItem[] = [];
  private filteredItems: PaletteItem[] = [];
  private selectedIndex = 0;

  constructor(
    private readonly rootEl: HTMLElement,
    private readonly tabStore: TabStore,
    private readonly appearance: AppearanceController,
    private readonly keybindings: KeybindingManager,
    private readonly onOpenSettings: () => void,
    private readonly onOpenBetik: () => void,
    private readonly onOpenHistory: () => void,
    private readonly onOpenBilge?: () => void,
    private readonly pluginRuntime?: PluginRuntime
  ) {
    this.backdropEl = document.createElement('div');
    this.backdropEl.className = 'palette-backdrop hidden';

    this.modalEl = document.createElement('div');
    this.modalEl.className = 'palette-modal';

    const header = document.createElement('div');
    header.className = 'palette-header';

    const searchIcon = document.createElement('span');
    searchIcon.className = 'palette-search-icon';
    searchIcon.innerHTML = `
      <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
        <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z"/>
      </svg>
    `;

    this.inputEl = document.createElement('input');
    this.inputEl.type = 'text';
    this.inputEl.className = 'palette-input';
    this.inputEl.placeholder = 'Search commands, actions, tabs, or themes...';
    this.inputEl.spellcheck = false;

    header.append(searchIcon, this.inputEl);

    this.listEl = document.createElement('div');
    this.listEl.className = 'palette-list';

    this.modalEl.append(header, this.listEl);
    this.backdropEl.appendChild(this.modalEl);
    this.rootEl.appendChild(this.backdropEl);

    this.inputEl.addEventListener('input', () => this.handleFilter());
    this.inputEl.addEventListener('keydown', (e) => this.handleKeydown(e));
    this.backdropEl.addEventListener('click', (e) => {
      if (e.target === this.backdropEl) this.close();
    });
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  open(): void {
    this.isOpen = true;
    this.collectItems();
    this.inputEl.value = '';
    this.filteredItems = [...this.items];
    this.selectedIndex = 0;
    this.renderList();

    this.backdropEl.classList.remove('hidden');
    this.inputEl.focus();
  }

  close(): void {
    this.isOpen = false;
    this.backdropEl.classList.add('hidden');
  }

  private collectItems(): void {
    const items: PaletteItem[] = [];

    // 1. Bitig Eylemleri
    for (const def of ACTION_DEFINITIONS) {
      if (def.id === 'palette.toggle') continue; // Kendi kendini tetiklemesin

      let action: () => void | Promise<void> = () => {};
      if (def.id === 'tab.new') action = () => this.tabStore.createTab();
      else if (def.id === 'tab.close') action = () => this.tabStore.closeTab('');
      else if (def.id === 'pane.splitRight') action = () => this.tabStore.splitActivePane('row');
      else if (def.id === 'pane.splitDown') action = () => this.tabStore.splitActivePane('column');
      else if (def.id === 'pane.close') action = () => this.tabStore.closeActivePane();
      else if (def.id === 'pane.zoom') action = () => this.tabStore.toggleZoomActivePane();
      else if (def.id === 'pane.navigateLeft') action = () => this.tabStore.navigateActivePane('left');
      else if (def.id === 'pane.navigateRight') action = () => this.tabStore.navigateActivePane('right');
      else if (def.id === 'pane.navigateUp') action = () => this.tabStore.navigateActivePane('up');
      else if (def.id === 'pane.navigateDown') action = () => this.tabStore.navigateActivePane('down');
      else if (def.id === 'terminal.search') action = () => this.tabStore.toggleSearch();
      else if (def.id === 'history.search') action = () => this.onOpenHistory();
      else if (def.id === 'theme.cycle') action = () => this.appearance.cycleTheme();
      else if (def.id === 'settings.toggle') action = () => this.onOpenSettings();
      else if (def.id === 'betik.toggle') action = () => this.onOpenBetik();
      else if (def.id === 'ai.prompt') action = () => this.onOpenBilge?.();

      items.push({
        id: `action:${def.id}`,
        title: def.name,
        subtitle: def.description,
        category: 'Actions',
        shortcut: this.keybindings.getBinding(def.id) || def.defaultKeys,
        action
      });
    }

    // 2. Open tabs
    const tabs = this.tabStore.getTabsInfo();
    for (const tab of tabs) {
      items.push({
        id: `tab:${tab.id}`,
        title: `Switch to Tab: ${tab.title}`,
        subtitle: tab.active ? 'Currently active tab' : 'Focus this tab',
        category: 'Tabs',
        action: () => this.tabStore.switchToTab(tab.id)
      });
    }

    // 3. Shell profiles
    const profiles = this.tabStore.getProfiles();
    for (const profile of profiles) {
      items.push({
        id: `profile:${profile.id}`,
        title: `Open New Tab: ${profile.name}`,
        subtitle: profile.command,
        category: 'Profiles',
        action: () => this.tabStore.createTab(profile.id)
      });
    }

    // 4. Themes
    const themes = this.appearance.getState()?.themes || [];
    for (const theme of themes) {
      items.push({
        id: `theme:${theme.id}`,
        title: `Theme: ${theme.name}`,
        subtitle: theme.author ? `Author: ${theme.author}` : 'Terminal Theme',
        category: 'Themes',
        action: () => window.bitig.settings.set({ activeTheme: theme.id })
      });
    }

    // 5. Dynamic Plugin Actions
    if (this.pluginRuntime) {
      const pluginActions = this.pluginRuntime.getActions();
      for (const pa of pluginActions) {
        items.push({
          id: `plugin:${pa.actionId}`,
          title: pa.name,
          subtitle: pa.description || 'Plugin Action',
          category: 'Actions',
          shortcut: pa.defaultKeys,
          action: () => window.bitig.plugins.executeAction(pa.actionId)
        });
      }
    }

    this.items = items;
  }

  private handleFilter(): void {
    const query = this.inputEl.value.trim();
    if (!query) {
      this.filteredItems = [...this.items];
    } else {
      const scored: { item: PaletteItem; score: number }[] = [];
      for (const item of this.items) {
        const textToMatch = `${item.title} ${item.subtitle || ''} ${item.category}`;
        const res = fuzzyScore(query, textToMatch);
        if (res.matches) {
          scored.push({ item, score: res.score });
        }
      }
      scored.sort((a, b) => b.score - a.score);
      this.filteredItems = scored.map((s) => s.item);
    }

    this.selectedIndex = 0;
    this.renderList();
  }

  private handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (this.filteredItems.length > 0) {
        this.selectedIndex = (this.selectedIndex + 1) % this.filteredItems.length;
        this.renderList();
        this.scrollSelectedIntoView();
      }
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (this.filteredItems.length > 0) {
        this.selectedIndex =
          (this.selectedIndex - 1 + this.filteredItems.length) % this.filteredItems.length;
        this.renderList();
        this.scrollSelectedIntoView();
      }
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      const selected = this.filteredItems[this.selectedIndex];
      if (selected) {
        this.close();
        void selected.action();
      }
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
    }
  }

  private scrollSelectedIntoView(): void {
    const selectedEl = this.listEl.querySelector('.palette-item.active') as HTMLElement | null;
    selectedEl?.scrollIntoView({ block: 'nearest' });
  }

  private renderList(): void {
    this.listEl.replaceChildren();

    if (this.filteredItems.length === 0) {
      const emptyEl = document.createElement('div');
      emptyEl.className = 'palette-empty';
      emptyEl.textContent = 'No matching command found';
      this.listEl.appendChild(emptyEl);
      return;
    }

    this.filteredItems.forEach((item, index) => {
      const itemEl = document.createElement('div');
      itemEl.className = `palette-item ${index === this.selectedIndex ? 'active' : ''}`;

      const infoEl = document.createElement('div');
      infoEl.className = 'palette-item-info';

      const titleEl = document.createElement('div');
      titleEl.className = 'palette-item-title';
      titleEl.textContent = item.title;

      if (item.subtitle) {
        const subEl = document.createElement('div');
        subEl.className = 'palette-item-subtitle';
        subEl.textContent = item.subtitle;
        infoEl.append(titleEl, subEl);
      } else {
        infoEl.appendChild(titleEl);
      }

      const metaEl = document.createElement('div');
      metaEl.className = 'palette-item-meta';

      const catBadge = document.createElement('span');
      catBadge.className = 'palette-cat-badge';
      catBadge.textContent = item.category;
      metaEl.appendChild(catBadge);

      if (item.shortcut) {
        const scEl = document.createElement('span');
        scEl.className = 'palette-shortcut';
        scEl.textContent = item.shortcut;
        metaEl.appendChild(scEl);
      }

      itemEl.append(infoEl, metaEl);

      itemEl.addEventListener('mouseenter', () => {
        this.selectedIndex = index;
        this.renderSelection();
      });

      itemEl.addEventListener('click', () => {
        this.close();
        void item.action();
      });

      this.listEl.appendChild(itemEl);
    });
  }

  private renderSelection(): void {
    const items = this.listEl.querySelectorAll('.palette-item');
    items.forEach((el, idx) => {
      el.classList.toggle('active', idx === this.selectedIndex);
    });
  }
}
