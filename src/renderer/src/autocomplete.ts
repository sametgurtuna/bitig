import type { PaneLeaf, InlineSuggestionHost } from './panes';
import type { CompletionContext } from '../../shared/completionTypes';
import { fuzzyScore } from './fuzzy';

/**
 * Akilli komut tamamlama (inline ghost text).
 *
 * Fish/Warp tarzi: kullanici yazdikca gecmis + proje baglamindan en olasi tam
 * komut seffaf bir "hayalet" metin olarak imlecin devaminda gosterilir, `Tab`
 * (ya da satir sonunda `ArrowRight`/`End`) ile kabul edilir.
 *
 * Neden DOM overlay: xterm.js'in yerlesik ghost-text destegi yok ve oneriyi
 * terminal tamponuna yazmak kabugun kendi echo'suyla catisir (satir bozulur,
 * geri alinamaz). Bu yuzden oneri, pane konteynerinin uzerinde konumlanan
 * mutlak bir <span> ile cizilir; terminal tamponuna HICBIR SEY yazilmaz.
 * Kabul edildiginde ise sadece "kalan ek" PTY'ye yazilir ve kabuk kendi
 * dogal echo'suyla satiri tamamlar.
 */

/** Kabuk gecmisi bos oldugunda bile ise yarayan kucuk bir yerlesik sozluk. */
const BUILTIN_COMMANDS = [
  'npm run dev',
  'npm run build',
  'npm run test',
  'npm install',
  'npm run typecheck',
  'git status',
  'git add -A',
  'git commit -m ""',
  'git push',
  'git pull',
  'git checkout -b ',
  'git log --oneline -10',
  'git diff',
  'docker ps -a',
  'docker compose up -d',
  'code .',
  'cd ..',
  'ls -la',
  'clear'
];

/** Girdi tamponunu guvenilmez kilan kontrol dizileri (ok tuslari, gecmis gezinme). */
const RESET_SEQUENCES = ['\x03', '\x15', '\x0c', '\x1b'];

interface Candidate {
  text: string;
  /** Yuksek olan kazanir. */
  score: number;
}

export interface InlineSuggestionsOptions {
  /** Pane'in guncel calisma dizinini doner (proje baglami icin). */
  getCwd: () => string | undefined;
}

export class InlineSuggestions implements InlineSuggestionHost {
  private leaf: PaneLeaf | null = null;
  private ghostEl: HTMLSpanElement | null = null;
  /** Kullanicinin o an yazmakta oldugu satir (yalniz bu oturumda yazilanlar). */
  private buffer = '';
  private suggestion = '';
  private enabled = true;
  /** Ok tusu/gecmis gezintisi sonrasi tampon guvenilmez olur. */
  private muted = false;
  private history: string[] = [];
  private context: CompletionContext | null = null;
  private contextCwd = '';
  private readonly disposers: Array<() => void> = [];

  constructor(private readonly options: InlineSuggestionsOptions) {}

  attach(leaf: PaneLeaf): void {
    this.leaf = leaf;

    const ghost = document.createElement('span');
    ghost.className = 'ghost-suggestion';
    ghost.setAttribute('aria-hidden', 'true');
    leaf.container.appendChild(ghost);
    this.ghostEl = ghost;

    const renderDisposable = leaf.terminal.onRender(() => this.position());
    const cursorDisposable = leaf.terminal.onCursorMove(() => this.position());
    const scrollDisposable = leaf.terminal.onScroll(() => this.position());
    this.disposers.push(
      () => renderDisposable.dispose(),
      () => cursorDisposable.dispose(),
      () => scrollDisposable.dispose()
    );

    void this.refreshHistory();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.clearSuggestion();
  }

  /**
   * Kullanici girdisini karakter karakter izler (telemetry.ts ile ayni desen).
   * Terminal tamponunu okumaya calismak prompt'a bagimli ve kirilgan olurdu.
   */
  handleInput(data: string): void {
    if (!this.enabled) return;

    // Ok tuslari / gecmis gezintisi: tampon artik ekrandaki satiri temsil
    // etmez, oneriyi sustur.
    if (data.startsWith('\x1b[') || data.startsWith('\x1bO')) {
      this.muted = true;
      this.buffer = '';
      this.clearSuggestion();
      return;
    }

    for (const char of data) {
      if (char === '\r' || char === '\n') {
        this.commit();
        continue;
      }
      if (char === '\x7f' || char === '\b') {
        this.buffer = this.buffer.slice(0, -1);
        this.muted = false;
        continue;
      }
      if (RESET_SEQUENCES.includes(char)) {
        this.buffer = '';
        this.muted = false;
        this.clearSuggestion();
        continue;
      }
      if (char === '\t') continue; // Tab kabul icin ayrildi
      if (char < ' ') continue; // diger kontrol karakterlerini yok say
      this.buffer += char;
      this.muted = false;
    }

    this.update();
  }

  /**
   * Tus olayini oneri katmani adina degerlendirir.
   * @returns true ise olay yutulur (shell'e gitmez).
   */
  handleKeyEvent(event: KeyboardEvent): boolean {
    if (!this.enabled || event.type !== 'keydown') return false;

    if (event.key === 'Escape' && this.suggestion) {
      this.clearSuggestion();
      return true;
    }

    if (!this.suggestion) return false;
    if (event.ctrlKey || event.altKey || event.metaKey) return false;

    if (event.key === 'Tab' || event.key === 'ArrowRight' || event.key === 'End') {
      this.accept();
      return true;
    }

    return false;
  }

  dispose(): void {
    for (const dispose of this.disposers) {
      try {
        dispose();
      } catch {
        // terminal zaten yok edilmisse sessizce gec
      }
    }
    this.disposers.length = 0;
    this.ghostEl?.remove();
    this.ghostEl = null;
    this.leaf = null;
  }

  /** Onerinin kalan ekini kabuga yazar; kabuk kendi echo'su ile satiri tamamlar. */
  private accept(): void {
    const leaf = this.leaf;
    if (!leaf || !this.suggestion) return;
    const remainder = this.suggestion;
    this.buffer += remainder;
    this.clearSuggestion();
    window.bitig.pty.write(leaf.id, remainder);
  }

  private commit(): void {
    const command = this.buffer.trim();
    this.buffer = '';
    this.muted = false;
    this.clearSuggestion();
    if (command) {
      // En son calistirilan komut bir sonraki onerilerde hemen kullanilabilsin.
      this.history = [command, ...this.history.filter((entry) => entry !== command)];
      void this.refreshHistory();
    }
    void this.refreshContext();
  }

  private update(): void {
    if (this.muted || this.buffer.trim() === '' || this.buffer.length < 2) {
      this.clearSuggestion();
      return;
    }

    void this.refreshContext();
    const best = this.findBest(this.buffer);
    if (!best) {
      this.clearSuggestion();
      return;
    }

    this.suggestion = best.slice(this.buffer.length);
    this.render();
  }

  private findBest(prefix: string): string | null {
    const lower = prefix.toLowerCase();
    const candidates: Candidate[] = [];

    const add = (text: string, weight: number): void => {
      if (text.length <= prefix.length) return;
      const lowerText = text.toLowerCase();
      if (lowerText.startsWith(lower)) {
        // Tam onek eslesmesi her zaman kazanir; kisa olan tercih edilir.
        candidates.push({ text, score: 10_000 + weight - text.length });
        return;
      }
      const fuzzy = fuzzyScore(prefix, text);
      if (fuzzy.matches && fuzzy.highlightIndices[0] === 0) {
        candidates.push({ text, score: fuzzy.score + weight });
      }
    };

    // 1. Komut gecmisi (frecency sirasi historyStore'dan gelir; basta olan agir basar)
    this.history.forEach((command, index) => add(command, 500 - index));

    // 2. Proje baglami: package.json script'leri, Makefile hedefleri
    if (this.context) {
      for (const script of this.context.scripts) add(script, 900);
      for (const target of this.context.makeTargets) add(target, 700);
      if (/^cd\s+\S*$/i.test(prefix)) {
        const typed = prefix.slice(3).trim();
        for (const dir of this.context.directories) {
          if (dir.toLowerCase().startsWith(typed.toLowerCase())) add(`cd ${dir}`, 950);
        }
      }
    }

    // 3. Yerlesik sozluk
    for (const command of BUILTIN_COMMANDS) add(command, 100);

    if (candidates.length === 0) return null;
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0].text;
  }

  private async refreshHistory(): Promise<void> {
    try {
      const entries = await window.bitig.history.list();
      const remembered = this.history.filter((c) => !entries.some((e) => e.command === c));
      this.history = [...remembered, ...entries.map((entry) => entry.command)];
    } catch {
      // gecmis okunamadiysa yerlesik sozlukle devam
    }
  }

  private async refreshContext(): Promise<void> {
    const cwd = this.options.getCwd();
    if (!cwd || cwd === this.contextCwd) return;
    this.contextCwd = cwd;
    try {
      this.context = await window.bitig.completion.context(cwd);
    } catch {
      this.context = null;
    }
  }

  private clearSuggestion(): void {
    this.suggestion = '';
    if (this.ghostEl) {
      this.ghostEl.textContent = '';
      this.ghostEl.style.display = 'none';
    }
  }

  private render(): void {
    if (!this.ghostEl) return;
    this.ghostEl.textContent = this.suggestion;
    this.ghostEl.style.display = this.suggestion ? 'block' : 'none';
    this.position();
  }

  /**
   * Hayalet metni imlecin hemen sagina konumlandirir. Hucre olcusu DOM'dan
   * olculur - xterm'in private `_core` API'sine bagimli kalmamak icin.
   */
  private position(): void {
    const leaf = this.leaf;
    const ghost = this.ghostEl;
    if (!leaf || !ghost || !this.suggestion) return;

    const rowsEl = leaf.terminal.element?.querySelector('.xterm-rows') as HTMLElement | null;
    if (!rowsEl || rowsEl.clientWidth === 0) {
      ghost.style.display = 'none';
      return;
    }

    const cellWidth = rowsEl.clientWidth / leaf.terminal.cols;
    const cellHeight = rowsEl.clientHeight / leaf.terminal.rows;
    const buffer = leaf.terminal.buffer.active;
    const viewportRow = buffer.cursorY;

    if (viewportRow < 0 || viewportRow >= leaf.terminal.rows) {
      ghost.style.display = 'none';
      return;
    }

    const rowsRect = rowsEl.getBoundingClientRect();
    const containerRect = leaf.container.getBoundingClientRect();
    const offsetX = rowsRect.left - containerRect.left;
    const offsetY = rowsRect.top - containerRect.top;

    ghost.style.display = 'block';
    ghost.style.left = `${offsetX + buffer.cursorX * cellWidth}px`;
    ghost.style.top = `${offsetY + viewportRow * cellHeight}px`;
    ghost.style.height = `${cellHeight}px`;
    ghost.style.lineHeight = `${cellHeight}px`;
    ghost.style.fontFamily = leaf.terminal.options.fontFamily ?? 'monospace';
    ghost.style.fontSize = `${leaf.terminal.options.fontSize ?? 14}px`;
    ghost.style.maxWidth = `${Math.max(0, rowsEl.clientWidth - buffer.cursorX * cellWidth)}px`;

    // Hayalet metnin dogal harf genisligi terminalin hucre genisligiyle birebir
    // ayni degil (font yedegi, alt piksel yuvarlama). Farki letter-spacing ile
    // kapatmazsak oneri terminal izgarasindan kayar ve yazilan metnin uzerine
    // biner - canli testte tam olarak bu goruldu.
    ghost.style.letterSpacing = '0px';
    const naturalAdvance = ghost.getBoundingClientRect().width / this.suggestion.length;
    if (naturalAdvance > 0) {
      ghost.style.letterSpacing = `${cellWidth - naturalAdvance}px`;
    }
  }
}
