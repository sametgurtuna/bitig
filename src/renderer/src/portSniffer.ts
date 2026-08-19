import type { DiscoveredPort } from '../../shared/cockpitTypes';

type PortListener = (ports: DiscoveredPort[], tabId: string) => void;

/**
 * Canli Port Dinleyicisi (Live Port Sniffer):
 * PTY cikti akisindan `localhost:3000`, `5173`, `8080` vb. dinleyen sunucu portlarini
 * otomatik yakalar ve sekme basliginda/kokpitte canli rozet olarak sunar.
 */
export class PortSniffer {
  private readonly portsByTab = new Map<string, Map<number, DiscoveredPort>>();
  private readonly listeners = new Set<PortListener>();

  // Port yakalama desenleri
  private readonly portRegexes: RegExp[] = [
    // localhost:3000, 127.0.0.1:8080, 0.0.0.0:5173 gibi direkt URL eslesimleri
    /(?:https?:\/\/)?(?:localhost|127\.0\.0\.1|0\.0\.0\.0):([0-9]{2,5})/gi,
    // "listening on port 3000", "started on port 8080" — "port" kelimesi zorunlu
    /(?:listening on|server running on|app running at|started on)\s+port\s*:?\s*([0-9]{2,5})/gi,
    // Vite / webpack / next: "Local: http://localhost:5173"
    /(?:Local|Network):\s*https?:\/\/(?:localhost|127\.0\.0\.1|[\d.]+):([0-9]{2,5})/gi
  ];

  onPortsChanged(listener: PortListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getPortsForTab(tabId: string): DiscoveredPort[] {
    const map = this.portsByTab.get(tabId);
    if (!map) return [];
    return Array.from(map.values()).sort((a, b) => a.port - b.port);
  }

  // PTY chunk'lari parcali gelebilir; her leaf icin son N karakteri tampon olarak tutariz.
  private readonly leafBuffers = new Map<string, string>();
  private readonly BUFFER_SIZE = 512;

  // ANSI/VT100 escape sequence'lerini siler (regex'in URL'leri duzgun bulabilmesi icin).
  private stripAnsi(text: string): string {
    return (
      text
        // eslint-disable-next-line no-control-regex
        // CSI dizileri: ESC [ ... harf
        .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
        // OSC dizileri: ESC ] ... ST veya BEL (oh-my-posh, OSC 7 CWD vs.)
        // eslint-disable-next-line no-control-regex
        .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
        // DCS / PM / APC dizileri
        // eslint-disable-next-line no-control-regex
        .replace(/\x1b[PX^_][^\x1b]*\x1b\\/g, '')
        // Tekli ESC + tek karakter (ESC c, ESC = vb.)
        // eslint-disable-next-line no-control-regex
        .replace(/\x1b[^[\]]/g, '')
    );
  }

  processOutput(tabId: string, leafId: string, text: string): void {
    let changed = false;

    if (!this.portsByTab.has(tabId)) {
      this.portsByTab.set(tabId, new Map());
    }
    const map = this.portsByTab.get(tabId)!;

    // Tamponu guncelle: onceki son parcayla birlestir, fazlasini at
    const prev = this.leafBuffers.get(leafId) ?? '';
    const combined = (prev + text).slice(-this.BUFFER_SIZE);
    this.leafBuffers.set(leafId, combined);

    // ANSI kodlarini temizle, sonra tarama yap
    const clean = this.stripAnsi(combined);

    for (const regex of this.portRegexes) {
      regex.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(clean)) !== null) {
        const portNum = parseInt(match[1], 10);
        if (this.isValidPort(portNum) && !map.has(portNum)) {
          map.set(portNum, {
            port: portNum,
            url: `http://localhost:${portNum}`,
            tabId,
            leafId,
            detectedAt: Date.now()
          });
          changed = true;
        }
      }
    }

    if (changed) {
      this.notify(tabId);
    }
  }

  clearTab(tabId: string): void {
    if (this.portsByTab.has(tabId)) {
      this.portsByTab.delete(tabId);
      this.notify(tabId);
    }
  }

  clearLeaf(leafId: string): void {
    this.leafBuffers.delete(leafId);
  }

  private isValidPort(port: number): boolean {
    return Number.isInteger(port) && port >= 80 && port <= 65535 && port !== 443;
  }

  private notify(tabId: string): void {
    const ports = this.getPortsForTab(tabId);
    this.listeners.forEach((listener) => listener(ports, tabId));
  }
}
