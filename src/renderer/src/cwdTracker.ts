/**
 * Kabuk entegrasyonu (OSC 7) devre disi ya da kullanilamaz oldugunda (or. WSL,
 * ozel bir kabuk, kullanicinin kendi ayari) calisma dizinini prompt satirindan
 * sezgisel olarak cikaran yedek izleyici.
 *
 * portSniffer.ts ile ayni deseni kullanir: PTY chunk'lari parcali geldigi icin
 * her leaf icin son N karakter tamponda tutulur ve regex oncesi ANSI dizileri
 * temizlenir. OSC 7 calisiyorsa bu izleyici devreye girmez (bkz. tabs.ts).
 */

const BUFFER_SIZE = 512;

/** `PS C:\Users\samet>` , `C:\Users\samet>` , `user@host:/home/x$` */
const PROMPT_PATTERNS: RegExp[] = [
  /(?:^|\n)PS\s+([A-Za-z]:\\[^\r\n>]*)>\s*$/,
  /(?:^|\n)([A-Za-z]:\\[^\r\n>]*)>\s*$/,
  /(?:^|\n)[^\r\n@]+@[^\r\n:]+:([^\r\n$#]+)[$#]\s*$/
];

export class CwdTracker {
  private readonly leafBuffers = new Map<string, string>();
  private readonly lastCwd = new Map<string, string>();
  private readonly listeners = new Set<(leafId: string, cwd: string) => void>();

  onCwdChanged(listener: (leafId: string, cwd: string) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  processOutput(leafId: string, text: string): void {
    const prev = this.leafBuffers.get(leafId) ?? '';
    const combined = (prev + text).slice(-BUFFER_SIZE);
    this.leafBuffers.set(leafId, combined);

    const cleaned = this.stripAnsi(combined);
    for (const pattern of PROMPT_PATTERNS) {
      const match = pattern.exec(cleaned);
      if (!match) continue;
      const cwd = match[1].trim();
      if (!cwd || cwd === this.lastCwd.get(leafId)) return;
      this.lastCwd.set(leafId, cwd);
      for (const listener of this.listeners) listener(leafId, cwd);
      return;
    }
  }

  clearLeaf(leafId: string): void {
    this.leafBuffers.delete(leafId);
    this.lastCwd.delete(leafId);
  }

  private stripAnsi(text: string): string {
    return (
      text
        // CSI dizileri: ESC [ ... harf
        // eslint-disable-next-line no-control-regex
        .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
        // OSC dizileri: ESC ] ... ST veya BEL
        // eslint-disable-next-line no-control-regex
        .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
        // DCS / PM / APC
        // eslint-disable-next-line no-control-regex
        .replace(/\x1b[PX^_][^\x1b]*\x1b\\/g, '')
        // Tekli ESC + karakter
        // eslint-disable-next-line no-control-regex
        .replace(/\x1b[^[\]]/g, '')
    );
  }
}
