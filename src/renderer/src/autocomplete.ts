import type { PaneLeaf, InlineSuggestionHost } from './panes';
import type { CompletionContext, DirEntriesResult } from '../../shared/completionTypes';
import type { HistoryEntry } from '../../shared/historyTypes';

/**
 * Akilli komut ve dosya/dizin tamamlama (inline ghost text).
 *
 * Fish / Warp / Fig benzeri akilli tamamlama:
 * - Kullanici yazdikca gecmis + proje baglami + gercek dosya sistemi taranir.
 * - `cd Desktop/` sonrasinda `Tab` veya harf yazildiginda hedef dizinin altindaki
 *   klasor ve dosyalar dinamik olarak listelenir (tab-tab ile derin klasor gezintisi).
 * - Imlecin devaminda seffaf bir "hayalet" (ghost) metin gosterilir.
 * - `Tab`, `ArrowRight` veya `End` ile kabul edilir.
 * - `Ctrl+ArrowRight` / `Alt+ArrowRight` ile parca/kelime bazinda kabul edilir.
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

/** Son argumani bir yol olarak tamamlanabilen komutlar. */
const PATH_COMMANDS = new Set([
  'cd',
  'chdir',
  'pushd',
  'ls',
  'dir',
  'cat',
  'type',
  'code',
  'cursor',
  'vim',
  'nvim',
  'nano',
  'notepad',
  'rm',
  'del',
  'erase',
  'mv',
  'move',
  'ren',
  'rename',
  'cp',
  'copy',
  'xcopy',
  'robocopy',
  'mkdir',
  'md',
  'rmdir',
  'rd',
  'touch',
  'ni',
  'new-item',
  'less',
  'head',
  'tail',
  'more',
  'node',
  'deno',
  'bun',
  'python',
  'python3',
  'py',
  'ruby',
  'perl',
  'php',
  'source',
  'exec',
  'sh',
  'bash',
  'zsh',
  'pwsh',
  'powershell',
  'cmd',
  'open',
  'start',
  'explorer',
  'explorer.exe',
  'tar',
  'zip',
  'unzip',
  '7z'
]);

/** Yalniz dizin bekleyen komutlar (dosya onerilmez). */
const DIR_ONLY_COMMANDS = new Set(['cd', 'chdir', 'pushd', 'mkdir', 'md', 'rmdir', 'rd']);

/** Git alt komutlarindan yol alanlar. */
const GIT_PATH_SUBCOMMANDS = new Set([
  'add',
  'diff',
  'checkout',
  'restore',
  'rm',
  'log',
  'mv',
  'status',
  'reset'
]);

/** Girdi tamponunu guvenilmez kilan kontrol dizileri (Ctrl+C, Ctrl+U, Ctrl+L, Esc). */
const RESET_SEQUENCES = ['\x03', '\x15', '\x0c', '\x1b'];

/** Proje baglaminin (dosya listesi vb.) yeniden okunma araligi. */
const CONTEXT_TTL_MS = 5_000;
/** Dizin ici tarama sonuclarinin onbellekte kalma suresi. */
const DIR_CACHE_TTL_MS = 3_000;

export interface InlineSuggestionsOptions {
  /** Pane'in guncel calisma dizinini doner (proje baglami icin). */
  getCwd: () => string | undefined;
}

interface ParsedPathToken {
  command: string;
  isDirOnly: boolean;
  rawArg: string;
  quoteChar: string; // '"' | "'" | ""
  dirPart: string; // e.g. "Desktop/" or "src/renderer/" or ""
  basePart: string; // e.g. "b" or "main" or ""
  sep: '/' | '\\';
  head: string; // line prefix up to the start of base completion
}

export class InlineSuggestions implements InlineSuggestionHost {
  private leaf: PaneLeaf | null = null;
  private ghostEl: HTMLSpanElement | null = null;
  /** Kullanicinin o an yazmakta oldugu satir (yalniz bu oturumda yazilanlar). */
  private buffer = '';
  private suggestion = '';
  private enabled = true;
  private muted = false;
  private history: HistoryEntry[] = [];
  /** Bu oturumda calistirilanlar - gecmis dosyasina yazilmadan da bilinir. */
  private sessionHistory: string[] = [];
  private context: CompletionContext | null = null;
  private contextCwd = '';
  private contextFetchedAt = 0;

  /** Dinamik alt dizin onbellek haritasi: key -> { timestamp, result } */
  private readonly dirEntriesCache = new Map<
    string,
    { timestamp: number; result: DirEntriesResult }
  >();
  private readonly pendingFetches = new Set<string>();

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
      if (char === '\t') {
        // Tab bize ulasmadiysa kabugun kendi tamamlamasi calisti: tampon guvenilir
        // degil ama sonraki yazimlarda kilitlenmesin diye sadece o anlik tamponu bosaltiyoruz.
        this.buffer = '';
        this.clearSuggestion();
        continue;
      }
      if (char < ' ') continue; // diger kontrol karakterlerini yok say

      // Normal yazilabilir karakter geldiginde susturma bayragini kaldir
      this.muted = false;
      this.buffer += char;
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
      event.preventDefault();
      return true;
    }

    if (!this.suggestion) return false;

    // Ctrl/Alt + Sag ok: oneriyi kelime kelime kabul et (fish davranisi).
    if (event.key === 'ArrowRight' && (event.ctrlKey || event.altKey)) {
      this.acceptWord();
      event.preventDefault();
      return true;
    }

    if (event.ctrlKey || event.altKey || event.metaKey) return false;

    if (event.key === 'Tab' || event.key === 'ArrowRight' || event.key === 'End') {
      this.accept();
      // Olayi yuttugumuz icin xterm kendi preventDefault'unu yapmaz; Tab'in
      // tarayici varsayilani odagi bir sonraki butona tasirdi.
      event.preventDefault();
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
    this.dirEntriesCache.clear();
    this.pendingFetches.clear();
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
    // Kalan satir icin (or. `cd Desktop/` sonrasi `Desktop` icerigi) yeni bir oneri uret.
    this.update();
  }

  /** Onerinin yalnizca bir sonraki kelimesini/yol parcasini kabul eder. */
  private acceptWord(): void {
    const leaf = this.leaf;
    if (!leaf || !this.suggestion) return;
    const match = /^\s*[^\s/\\]*[\s/\\]?/.exec(this.suggestion);
    const chunk = match && match[0] ? match[0] : this.suggestion;
    this.buffer += chunk;
    window.bitig.pty.write(leaf.id, chunk);
    this.update();
  }

  private commit(): void {
    const command = this.buffer.trim();
    this.buffer = '';
    this.muted = false;
    this.clearSuggestion();
    if (command) {
      // En son calistirilan komut bir sonraki onerilerde hemen kullanilabilsin.
      this.sessionHistory = [
        command,
        ...this.sessionHistory.filter((entry) => entry !== command)
      ].slice(0, 100);
      void this.refreshHistory();
    }
    // Komut dosya sistemini degistirmis olabilir (mkdir, git checkout, cd ...).
    this.contextFetchedAt = 0;
    this.dirEntriesCache.clear();
    void this.refreshContext();
  }

  private update(): void {
    const line = this.buffer;
    if (this.muted || line.trim() === '') {
      this.clearSuggestion();
      return;
    }

    void this.refreshContext();
    const best = this.findBest(line);
    if (!best) {
      this.clearSuggestion();
      return;
    }

    this.suggestion = best.slice(line.length);
    if (!this.suggestion) {
      this.clearSuggestion();
      return;
    }
    this.render();
  }

  private findBest(line: string): string | null {
    const lower = line.toLowerCase();
    const scores = new Map<string, number>();

    /** Yalniz gercek onek eslesmeleri aday olabilir. */
    const add = (text: string, weight: number): void => {
      if (text.length <= line.length) return;
      if (!text.toLowerCase().startsWith(lower)) return;
      // Yazimi birebir koruyan aday, buyuk/kucuk harf degistirene tercih edilir.
      const caseBonus = text.startsWith(line) ? 30 : 0;
      // Kisa tamamlamalar daha guvenli: uzayan ek kadar kucuk ceza.
      const score = weight + caseBonus - Math.min(60, (text.length - line.length) * 0.5);
      const previous = scores.get(text);
      if (previous === undefined || score > previous) scores.set(text, score);
    };

    const cwd = this.options.getCwd();

    // 1. Dinamik Yol Tamamlama (cd, ls, code, git add, ./, ../, alt dizinler...)
    const pathToken = this.parsePathToken(line);
    if (pathToken) {
      this.addPathCompletions(pathToken, cwd, add);
    }

    // 2. Komut gecmisi - frecency (siklik + tazelik + ayni dizin) ile puanlanir.
    const now = Date.now();
    for (const entry of this.history) {
      const ageHours = Math.max(0, now - entry.timestamp) / 3_600_000;
      const recency = ageHours < 1 ? 140 : ageHours < 24 ? 100 : ageHours < 24 * 7 ? 55 : 15;
      const frequency = Math.min(80, Math.log2(entry.count + 1) * 24);
      const sameCwd = cwd && entry.cwd && samePath(entry.cwd, cwd) ? 90 : 0;
      // Hata ile biten komutlari one cikarmanin anlami yok.
      const failed = entry.exitCode ? -70 : 0;
      add(entry.command, 500 + recency + frequency + sameCwd + failed);
    }

    // Bu oturumda calistirilanlar her zaman cok tazedir.
    this.sessionHistory.forEach((command, index) => add(command, 820 - index * 4));

    // 3. Proje baglami (package scripts & make targets)
    if (this.context) {
      const runMatch = /^(npm|pnpm|yarn|bun)\s+(run\s+)?\S*$/i.exec(line);
      if (runMatch) {
        const manager = runMatch[1];
        const runWord = runMatch[2] ? 'run ' : manager.toLowerCase() === 'npm' ? 'run ' : '';
        for (const script of this.context.scripts) {
          const name = script.replace(/^npm\s+run\s+/i, '');
          add(`${manager} ${runWord}${name}`, 1050);
        }
      }
      for (const script of this.context.scripts) add(script, 950);
      for (const target of this.context.makeTargets) add(target, 900);
    }

    // 4. Yerlesik sozluk
    for (const command of BUILTIN_COMMANDS) add(command, 120);

    let bestText: string | null = null;
    let bestScore = -Infinity;
    for (const [text, score] of scores) {
      if (score > bestScore) {
        bestScore = score;
        bestText = text;
      }
    }
    return bestText;
  }

  /**
   * Satirdan yol tamamlama argumanini ve dizin/dosya parcalarini cikarir.
   */
  private parsePathToken(line: string): ParsedPathToken | null {
    const trimmedStart = line.replace(/^\s+/, '');
    if (!trimmedStart) return null;

    const words = trimmedStart.split(/\s+/);
    const mainCommand = (words[0] || '').toLowerCase();
    if (!mainCommand) return null;

    let isPathEligible = PATH_COMMANDS.has(mainCommand);
    let isDirOnly = DIR_ONLY_COMMANDS.has(mainCommand);

    // Git alt komut kontrolu (git add <yol>, git diff <yol>...)
    if (mainCommand === 'git' && words.length >= 2) {
      const subCommand = (words[1] || '').toLowerCase();
      if (GIT_PATH_SUBCOMMANDS.has(subCommand)) {
        isPathEligible = true;
        isDirOnly = false;
      }
    }

    // ./ veya .\ veya ../ ile baslayan komut/calistirma
    if (/^(\.|\.\.|\~|[A-Za-z]:)[\\/]/.test(trimmedStart) || trimmedStart.startsWith('/')) {
      isPathEligible = true;
    }

    if (!isPathEligible) return null;

    // Satirin son argumanini bul (tirnaklari da hesaba katarak)
    let rawArg = '';
    let quoteChar = '';

    // Eger satir boslukla bitiyorsa (or. `cd ` veya `cd Desktop/ `)
    if (/\s$/.test(line)) {
      rawArg = '';
      quoteChar = '';
    } else {
      // Satirin son kelimesini/tirnakli obegini yakala
      const matchQuote = /(?:^|\s)(["'])([^"']*)$/.exec(line);
      if (matchQuote) {
        quoteChar = matchQuote[1];
        rawArg = matchQuote[2];
      } else {
        const lastWord = words[words.length - 1] || '';
        rawArg = lastWord;
      }
    }

    // Arguman '-' ile basliyorsa bayraktir, yol degildir (or. `ls -la`)
    if (rawArg.startsWith('-')) return null;

    const lastSlashPos = Math.max(rawArg.lastIndexOf('/'), rawArg.lastIndexOf('\\'));
    let dirPart = '';
    let basePart = '';
    let sep: '/' | '\\' = rawArg.includes('\\') ? '\\' : '/';

    if (lastSlashPos === -1) {
      dirPart = '';
      basePart = rawArg;
    } else {
      sep = rawArg[lastSlashPos] === '\\' ? '\\' : '/';
      dirPart = rawArg.slice(0, lastSlashPos + 1);
      basePart = rawArg.slice(lastSlashPos + 1);
    }

    const head = line.slice(0, line.length - basePart.length);

    return {
      command: mainCommand,
      isDirOnly,
      rawArg,
      quoteChar,
      dirPart,
      basePart,
      sep,
      head
    };
  }

  /**
   * Hedef dizini tarayip adaylari ekler.
   */
  private addPathCompletions(
    token: ParsedPathToken,
    cwd: string | undefined,
    add: (text: string, weight: number) => void
  ): void {
    const { head, dirPart, basePart, sep, isDirOnly } = token;
    const cacheKey = `${cwd || ''}:::${dirPart}`;

    const cached = this.dirEntriesCache.get(cacheKey);
    const isFresh = cached && Date.now() - cached.timestamp < DIR_CACHE_TTL_MS;

    if (isFresh && cached) {
      const baseLower = basePart.toLowerCase();

      // 1. Dizinler (her zaman sep ile biter, boylece Tab-Tab aninda sonrakini acar)
      for (const dir of cached.result.directories) {
        if (!dir.toLowerCase().startsWith(baseLower)) continue;

        // Dizin adinda bosluk varsa ve kullanici tirnak acmadiysa tirnakla sar
        let candidate: string;
        if (dir.includes(' ') && !token.quoteChar) {
          // or. `cd "Program Files/"`
          const prefixBeforeToken = head.slice(0, head.length - dirPart.length);
          candidate = `${prefixBeforeToken}"${dirPart}${dir}${sep}"`;
        } else {
          candidate = `${head}${dir}${sep}`;
        }
        // Dizinler derin gezinti icin en yuksek agirlikla onerilir
        add(candidate, 1100);
      }

      // 2. Dosyalar (dizin-yalniz komutlar haric)
      if (!isDirOnly) {
        for (const file of cached.result.files) {
          if (!file.toLowerCase().startsWith(baseLower)) continue;

          let candidate: string;
          if (file.includes(' ') && !token.quoteChar) {
            const prefixBeforeToken = head.slice(0, head.length - dirPart.length);
            candidate = `${prefixBeforeToken}"${dirPart}${file}"`;
          } else {
            candidate = `${head}${file}${token.quoteChar ? token.quoteChar : ''}`;
          }
          add(candidate, 1000);
        }
      }
    } else {
      // Onbellekte yoksa ya da eskidiyse arka planda getir
      void this.fetchDirEntries(cwd, dirPart);
    }
  }

  /**
   * Belirtilen dizini arka planda asenkron tarar ve geldikten sonra oneriyi gunceller.
   */
  private async fetchDirEntries(cwd: string | undefined, dirPart: string): Promise<void> {
    const cacheKey = `${cwd || ''}:::${dirPart}`;
    if (this.pendingFetches.has(cacheKey)) return;

    this.pendingFetches.add(cacheKey);
    try {
      const result = await window.bitig.completion.dirEntries(cwd, dirPart);
      this.dirEntriesCache.set(cacheKey, {
        timestamp: Date.now(),
        result
      });

      // Eger kullanici hala ayni dizini yaziyorsa aninda ekrana yansit
      const currentToken = this.parsePathToken(this.buffer);
      if (currentToken && `${cwd || ''}:::${currentToken.dirPart}` === cacheKey) {
        const best = this.findBest(this.buffer);
        if (best && best.length > this.buffer.length) {
          this.suggestion = best.slice(this.buffer.length);
          this.render();
        }
      }
    } catch {
      // Hata durumunda sessizce gec
    } finally {
      this.pendingFetches.delete(cacheKey);
    }
  }

  private async refreshHistory(): Promise<void> {
    try {
      this.history = await window.bitig.history.list();
    } catch {
      // gecmis okunamadiysa oturum gecmisi + yerlesik sozlukle devam
    }
  }

  private async refreshContext(): Promise<void> {
    const cwd = this.options.getCwd();
    if (!cwd) return;
    const fresh = cwd === this.contextCwd && Date.now() - this.contextFetchedAt < CONTEXT_TTL_MS;
    if (fresh) return;
    this.contextCwd = cwd;
    this.contextFetchedAt = Date.now();
    try {
      this.context = await window.bitig.completion.context(cwd);
      // Calisma dizininin kokunu dirEntries onbelleklerine de hemen ekle
      if (this.context) {
        this.dirEntriesCache.set(`${cwd}:::`, {
          timestamp: Date.now(),
          result: {
            resolvedDir: cwd,
            directories: this.context.directories,
            files: this.context.files
          }
        });
      }
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
    // biner.
    ghost.style.letterSpacing = '0px';
    const naturalAdvance = ghost.getBoundingClientRect().width / this.suggestion.length;
    if (naturalAdvance > 0) {
      ghost.style.letterSpacing = `${cellWidth - naturalAdvance}px`;
    }
  }
}

/** Windows yollari buyuk/kucuk harf ve ayirac farkina duyarsiz karsilastirilir. */
function samePath(a: string, b: string): boolean {
  const normalize = (value: string): string =>
    value.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  return normalize(a) === normalize(b);
}
