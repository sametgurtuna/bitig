import type { PaneLeaf, InlineSuggestionHost } from './panes';
import type { CompletionContext } from '../../shared/completionTypes';
import type { HistoryEntry } from '../../shared/historyTypes';

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
 *
 * ONEMLI: Bir aday yalnizca yazilan satirin GERCEK bir oneki ise onerilebilir.
 * Ghost text "kalanin eklenmesi" demektir; fuzzy (araya serpistirilmis harf)
 * eslesmeleri burada anlamsizdir - eski surumde fuzzy adaylar da kabul edilip
 * `aday.slice(buffer.length)` ile kesiliyordu, ortaya yazilan metinle alakasiz
 * bir ek cikiyordu.
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
  'ls',
  'dir',
  'cat',
  'type',
  'code',
  'vim',
  'nvim',
  'nano',
  'rm',
  'del',
  'mv',
  'move',
  'cp',
  'copy',
  'mkdir',
  'touch',
  'less',
  'head',
  'tail',
  'node',
  'python',
  'py',
  'source',
  'pushd'
]);

/** Yalniz dizin bekleyen komutlar (dosya onerilmez). */
const DIR_ONLY_COMMANDS = new Set(['cd', 'pushd', 'mkdir']);

/** Girdi tamponunu guvenilmez kilan kontrol dizileri (ok tuslari, gecmis gezinme). */
const RESET_SEQUENCES = ['\x03', '\x15', '\x0c', '\x1b'];

/** Proje baglaminin (dosya listesi vb.) yeniden okunma araligi. */
const CONTEXT_TTL_MS = 5_000;

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
  /**
   * Ok tusu/gecmis gezintisi ya da kabugun kendi Tab tamamlamasi sonrasi tampon
   * ekrandaki satiri temsil etmez. Bu bayrak yalnizca satir gercekten sifirlanan
   * bir noktada (Enter, Ctrl+C, Ctrl+U, Ctrl+L, Esc) temizlenir - aksi halde
   * yazilan bir sonraki harf, yarim bir tamponla alakasiz oneriler uretir.
   */
  private muted = false;
  private history: HistoryEntry[] = [];
  /** Bu oturumda calistirilanlar - gecmis dosyasina yazilmadan da bilinir. */
  private sessionHistory: string[] = [];
  private context: CompletionContext | null = null;
  private contextCwd = '';
  private contextFetchedAt = 0;
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
        continue;
      }
      if (RESET_SEQUENCES.includes(char)) {
        this.buffer = '';
        this.muted = false;
        this.clearSuggestion();
        continue;
      }
      if (char === '\t') {
        // Tab bize ulasmadiysa kabugun kendi tamamlamasi calisti: satir bizim
        // haberimiz olmadan degisti, tampon artik guvenilir degil.
        this.muted = true;
        this.buffer = '';
        this.clearSuggestion();
        continue;
      }
      if (char < ' ') continue; // diger kontrol karakterlerini yok say
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
    // Kalan satir icin (or. `cd src/` sonrasi) yeni bir oneri uret.
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
    // Komut dosya sistemini degistirmis olabilir (mkdir, git checkout, ...).
    this.contextFetchedAt = 0;
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

    /** Yalniz gercek onek eslesmeleri aday olabilir (bkz. dosya basi notu). */
    const add = (text: string, weight: number): void => {
      if (text.length <= line.length) return;
      if (!text.toLowerCase().startsWith(lower)) return;
      // Yazimi birebir koruyan aday, buyuk/kucuk harf degistirene tercih edilir.
      const caseBonus = text.startsWith(line) ? 25 : 0;
      // Kisa tamamlamalar daha guvenli: uzayan ek kadar ceza.
      const score = weight + caseBonus - Math.min(60, (text.length - line.length) * 0.5);
      const previous = scores.get(text);
      if (previous === undefined || score > previous) scores.set(text, score);
    };

    const token = lastToken(line);
    const cwd = this.options.getCwd();

    // 1. Komut gecmisi - frecency (siklik + tazelik + ayni dizin) ile puanlanir.
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

    // Bu oturumda calistirilanlar her zaman en tazedir.
    this.sessionHistory.forEach((command, index) => add(command, 820 - index * 4));

    // 2. Proje baglami
    if (this.context) {
      // Paket yoneticisi varyantlari: `pnpm dev`, `yarn run build`, `bun dev`...
      const runMatch = /^(npm|pnpm|yarn|bun)\s+(run\s+)?\S*$/i.exec(line);
      if (runMatch) {
        const manager = runMatch[1];
        const runWord = runMatch[2] ? 'run ' : manager.toLowerCase() === 'npm' ? 'run ' : '';
        for (const script of this.context.scripts) {
          const name = script.replace(/^npm\s+run\s+/i, '');
          add(`${manager} ${runWord}${name}`, 1000);
        }
      }
      for (const script of this.context.scripts) add(script, 950);
      for (const target of this.context.makeTargets) add(target, 900);

      // 3. Yol tamamlama: son argumani dizin/dosya adlariyla tamamla.
      if (token && PATH_COMMANDS.has(token.command.toLowerCase())) {
        const typed = token.value;
        // Ayirac iceren yollarda alt dizinin icerigi elimizde yok.
        if (!/[\\/]/.test(typed) && !typed.startsWith('-')) {
          const dirOnly = DIR_ONLY_COMMANDS.has(token.command.toLowerCase());
          const head = line.slice(0, line.length - typed.length);
          for (const dir of this.context.directories) {
            if (dir.includes(' ')) continue; // tirnak gerektirir, ghost text bozulur
            add(`${head}${dir}/`, 980);
          }
          if (!dirOnly) {
            for (const file of this.context.files) {
              if (file.includes(' ')) continue;
              add(`${head}${file}`, 940);
            }
          }
        }
      }
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

/** Satirin ilk kelimesi ve imlecin uzerinde bulundugu son (yarim) argumani. */
function lastToken(line: string): { command: string; value: string } | null {
  const trimmedStart = line.replace(/^\s+/, '');
  if (!trimmedStart) return null;
  const command = trimmedStart.split(/\s+/)[0] ?? '';
  if (!command) return null;
  if (/\s$/.test(line)) return { command, value: '' };
  const parts = trimmedStart.split(/\s+/);
  if (parts.length < 2) return null;
  return { command, value: parts[parts.length - 1] };
}

/** Windows yollari buyuk/kucuk harf ve ayirac farkina duyarsiz karsilastirilir. */
function samePath(a: string, b: string): boolean {
  const normalize = (value: string): string =>
    value.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  return normalize(a) === normalize(b);
}
