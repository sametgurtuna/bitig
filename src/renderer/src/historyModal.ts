import type { HistoryEntry } from '../../shared/historyTypes';
import { fuzzyScore } from './fuzzy';
import type { TabStore } from './tabs';

/**
 * In-Terminal Interactive `Ctrl+R` Fuzzy History Popup:
 * Oturumlar arasi komut gecmisini listeler, fuzzy filtreler ve Enter ile terminale enjekte eder.
 */
export class HistoryModal {
  private isOpen = false;
  private entries: HistoryEntry[] = [];
  private filteredEntries: HistoryEntry[] = [];
  private selectedIndex = 0;

  private readonly backdropEl: HTMLDivElement;
  private readonly modalEl: HTMLDivElement;
  private readonly inputEl: HTMLInputElement;
  private readonly listEl: HTMLDivElement;

  constructor(
    private readonly rootEl: HTMLElement,
    private readonly tabStore: TabStore
  ) {
    this.backdropEl = document.createElement('div');
    this.backdropEl.className = 'history-backdrop hidden';

    this.modalEl = document.createElement('div');
    this.modalEl.className = 'history-modal';

    const header = document.createElement('div');
    header.className = 'history-header';

    const promptPrefix = document.createElement('span');
    promptPrefix.className = 'history-prefix';
    promptPrefix.textContent = 'btr-search:';

    this.inputEl = document.createElement('input');
    this.inputEl.type = 'text';
    this.inputEl.className = 'history-input';
    this.inputEl.placeholder = 'Search command history... (Ctrl+R / Enter)';
    this.inputEl.spellcheck = false;

    header.append(promptPrefix, this.inputEl);

    this.listEl = document.createElement('div');
    this.listEl.className = 'history-list';

    const footer = document.createElement('div');
    footer.className = 'history-footer';

    const hint = document.createElement('span');
    hint.className = 'history-hint';
    hint.innerHTML = '<kbd>Up</kbd><kbd>Down</kbd><span>Navigate</span><kbd>Enter</kbd><span>Run</span><kbd>Esc</kbd><span>Close</span>';

    const clearBtn = document.createElement('button');
    clearBtn.className = 'history-clear-btn';
    clearBtn.textContent = 'Clear History';
    clearBtn.addEventListener('click', async () => {
      if (confirm('Are you sure you want to delete the entire command history?')) {
        this.entries = await window.bitig.history.clear();
        this.filterEntries();
      }
    });

    footer.append(hint, clearBtn);

    this.modalEl.append(header, this.listEl, footer);
    this.backdropEl.appendChild(this.modalEl);
    this.rootEl.appendChild(this.backdropEl);

    this.inputEl.addEventListener('input', () => this.filterEntries());
    this.inputEl.addEventListener('keydown', (e) => this.handleKeydown(e));
    this.backdropEl.addEventListener('click', (e) => {
      if (e.target === this.backdropEl) this.close();
    });
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else void this.open();
  }

  async open(): Promise<void> {
    this.isOpen = true;
    this.entries = await window.bitig.history.list();
    this.inputEl.value = '';
    this.filteredEntries = [...this.entries];
    this.selectedIndex = 0;
    this.renderList();

    this.backdropEl.classList.remove('hidden');
    this.inputEl.focus();
  }

  close(): void {
    this.isOpen = false;
    this.backdropEl.classList.add('hidden');
  }

  private filterEntries(): void {
    const query = this.inputEl.value.trim();
    if (!query) {
      this.filteredEntries = [...this.entries];
    } else {
      const scored: { entry: HistoryEntry; score: number }[] = [];
      for (const entry of this.entries) {
        const res = fuzzyScore(query, entry.command);
        if (res.matches) {
          scored.push({ entry, score: res.score });
        }
      }
      scored.sort((a, b) => b.score - a.score);
      this.filteredEntries = scored.map((s) => s.entry);
    }

    this.selectedIndex = 0;
    this.renderList();
  }

  private handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (this.filteredEntries.length > 0) {
        this.selectedIndex = (this.selectedIndex + 1) % this.filteredEntries.length;
        this.renderList();
        this.scrollSelectedIntoView();
      }
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (this.filteredEntries.length > 0) {
        this.selectedIndex =
          (this.selectedIndex - 1 + this.filteredEntries.length) % this.filteredEntries.length;
        this.renderList();
        this.scrollSelectedIntoView();
      }
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      const selected = this.filteredEntries[this.selectedIndex];
      if (selected) {
        this.close();
        this.tabStore.writeToActivePane(`${selected.command}\r`);
      }
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
    }
  }

  private scrollSelectedIntoView(): void {
    const activeEl = this.listEl.querySelector('.history-item.active') as HTMLElement | null;
    activeEl?.scrollIntoView({ block: 'nearest' });
  }

  private renderList(): void {
    this.listEl.replaceChildren();

    if (this.filteredEntries.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'history-empty';
      empty.textContent = 'No command found in history.';
      this.listEl.appendChild(empty);
      return;
    }

    this.filteredEntries.forEach((entry, index) => {
      const itemEl = document.createElement('div');
      itemEl.className = `history-item ${index === this.selectedIndex ? 'active' : ''}`;

      const cmdEl = document.createElement('div');
      cmdEl.className = 'history-item-cmd';
      cmdEl.textContent = entry.command;

      const metaEl = document.createElement('div');
      metaEl.className = 'history-item-meta';

      if (entry.count > 1) {
        const countBadge = document.createElement('span');
        countBadge.className = 'history-badge-count';
        countBadge.textContent = `${entry.count}x`;
        metaEl.appendChild(countBadge);
      }

      if (entry.lastDurationMs !== undefined && entry.lastDurationMs > 500) {
        const durBadge = document.createElement('span');
        durBadge.className = 'history-badge-dur';
        durBadge.textContent = `${(entry.lastDurationMs / 1000).toFixed(1)}s`;
        metaEl.appendChild(durBadge);
      }

      const timeAgo = this.formatTimeAgo(entry.timestamp);
      const timeEl = document.createElement('span');
      timeEl.className = 'history-item-time';
      timeEl.textContent = timeAgo;
      metaEl.appendChild(timeEl);

      itemEl.append(cmdEl, metaEl);

      itemEl.addEventListener('mouseenter', () => {
        this.selectedIndex = index;
        this.renderSelection();
      });

      itemEl.addEventListener('click', () => {
        this.close();
        this.tabStore.writeToActivePane(`${entry.command}\r`);
      });

      this.listEl.appendChild(itemEl);
    });
  }

  private renderSelection(): void {
    const items = this.listEl.querySelectorAll('.history-item');
    items.forEach((el, idx) => {
      el.classList.toggle('active', idx === this.selectedIndex);
    });
  }

  private formatTimeAgo(timestamp: number): string {
    const diff = Math.max(0, Date.now() - timestamp);
    const sec = Math.floor(diff / 1000);
    if (sec < 60) return 'just now';
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m`;
    const hrs = Math.floor(min / 60);
    if (hrs < 24) return `${hrs}h`;
    const days = Math.floor(hrs / 24);
    return `${days}d`;
  }
}
