import type { Terminal } from '@xterm/xterm';
import type { SearchAddon, ISearchOptions } from '@xterm/addon-search';

/**
 * Terminal uzerinde kayan (floating) cam efektli arama cubugu bileseni.
 * Ctrl+F ile acilir, Enter/Shift+Enter ile arama yapar, Escape ile kapanip
 * terminale odaklanir.
 */
export class SearchBar {
  private readonly element: HTMLDivElement;
  private readonly input: HTMLInputElement;
  private readonly matchCountEl: HTMLSpanElement;
  private readonly caseSensitiveBtn: HTMLButtonElement;
  private readonly regexBtn: HTMLButtonElement;
  private readonly wholeWordBtn: HTMLButtonElement;
  private readonly prevBtn: HTMLButtonElement;
  private readonly nextBtn: HTMLButtonElement;
  private readonly closeBtn: HTMLButtonElement;

  private currentTerminal: Terminal | null = null;
  private currentAddon: SearchAddon | null = null;
  private isOpen = false;

  private caseSensitive = false;
  private useRegex = false;
  private wholeWord = false;

  constructor(parentEl: HTMLElement) {
    this.element = document.createElement('div');
    this.element.className = 'terminal-search-bar hidden';

    this.input = document.createElement('input');
    this.input.type = 'text';
    this.input.placeholder = 'Terminalde ara...';
    this.input.className = 'search-input';

    this.matchCountEl = document.createElement('span');
    this.matchCountEl.className = 'search-match-count';

    this.caseSensitiveBtn = this.createToggleBtn('Aa', 'Buyuk/Kucuk Harfe Duyarli');
    this.regexBtn = this.createToggleBtn('.*', 'Duzenli Ifade (Regex)');
    this.wholeWordBtn = this.createToggleBtn('\\b', 'Tam Kelime');

    this.prevBtn = this.createIconButton(
      '<svg viewBox="0 0 10 10"><path d="M5 2L1 7h8z" fill="currentColor"/></svg>',
      'Onceki (Shift+Enter)'
    );
    this.nextBtn = this.createIconButton(
      '<svg viewBox="0 0 10 10"><path d="M5 8L1 3h8z" fill="currentColor"/></svg>',
      'Sonraki (Enter)'
    );
    this.closeBtn = this.createIconButton(
      '<svg viewBox="0 0 10 10"><path d="M1 1l8 8M9 1L1 9" stroke="currentColor" stroke-width="1.5"/></svg>',
      'Kapat (Escape)'
    );

    const controls = document.createElement('div');
    controls.className = 'search-controls';
    controls.append(
      this.caseSensitiveBtn,
      this.regexBtn,
      this.wholeWordBtn,
      this.prevBtn,
      this.nextBtn,
      this.closeBtn
    );

    this.element.append(this.input, this.matchCountEl, controls);
    parentEl.appendChild(this.element);

    this.wireEvents();
  }

  private createToggleBtn(label: string, title: string): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'search-btn search-toggle-btn';
    btn.textContent = label;
    btn.title = title;
    return btn;
  }

  private createIconButton(svgHtml: string, title: string): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'search-btn search-icon-btn';
    btn.innerHTML = svgHtml;
    btn.title = title;
    return btn;
  }

  private wireEvents(): void {
    this.input.addEventListener('input', () => this.findNext(true));

    this.input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        if (event.shiftKey) {
          this.findPrevious();
        } else {
          this.findNext();
        }
      } else if (event.key === 'Escape') {
        event.preventDefault();
        this.close();
      }
    });

    this.caseSensitiveBtn.addEventListener('click', () => {
      this.caseSensitive = !this.caseSensitive;
      this.caseSensitiveBtn.classList.toggle('active', this.caseSensitive);
      this.findNext(true);
    });

    this.regexBtn.addEventListener('click', () => {
      this.useRegex = !this.useRegex;
      this.regexBtn.classList.toggle('active', this.useRegex);
      this.findNext(true);
    });

    this.wholeWordBtn.addEventListener('click', () => {
      this.wholeWord = !this.wholeWord;
      this.wholeWordBtn.classList.toggle('active', this.wholeWord);
      this.findNext(true);
    });

    this.prevBtn.addEventListener('click', () => this.findPrevious());
    this.nextBtn.addEventListener('click', () => this.findNext());
    this.closeBtn.addEventListener('click', () => this.close());
  }

  private getOptions(): ISearchOptions {
    return {
      caseSensitive: this.caseSensitive,
      regex: this.useRegex,
      wholeWord: this.wholeWord,
      decorations: {
        matchBackground: '#e3b34144',
        matchBorder: '#e3b341',
        matchOverviewRuler: '#e3b341',
        activeMatchBackground: '#7dd3fc66',
        activeMatchBorder: '#7dd3fc',
        activeMatchColorOverviewRuler: '#7dd3fc'
      }
    };
  }

  open(terminal: Terminal, addon: SearchAddon): void {
    this.currentTerminal = terminal;
    this.currentAddon = addon;
    this.isOpen = true;
    this.element.classList.remove('hidden');

    const selection = terminal.getSelection();
    if (selection && selection.length < 100 && !selection.includes('\n')) {
      this.input.value = selection;
    }

    this.input.focus();
    this.input.select();
    if (this.input.value) {
      this.findNext(true);
    }
  }

  close(): void {
    this.isOpen = false;
    this.element.classList.add('hidden');
    if (this.currentAddon) {
      this.currentAddon.clearDecorations();
    }
    this.currentTerminal?.focus();
  }

  toggle(terminal: Terminal, addon: SearchAddon): void {
    if (this.isOpen && this.currentTerminal === terminal) {
      this.close();
    } else {
      this.open(terminal, addon);
    }
  }

  findNext(incremental = false): void {
    const query = this.input.value;
    if (!query || !this.currentAddon) {
      this.matchCountEl.textContent = '';
      return;
    }
    const found = this.currentAddon.findNext(query, {
      ...this.getOptions(),
      incremental
    });
    this.matchCountEl.textContent = found ? '' : 'Sonuç yok';
  }

  findPrevious(): void {
    const query = this.input.value;
    if (!query || !this.currentAddon) {
      this.matchCountEl.textContent = '';
      return;
    }
    const found = this.currentAddon.findPrevious(query, this.getOptions());
    this.matchCountEl.textContent = found ? '' : 'Sonuç yok';
  }
}
