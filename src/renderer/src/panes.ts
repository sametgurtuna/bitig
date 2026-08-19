import { Terminal, type ITheme } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';

export type SplitDirection = 'row' | 'column';

export interface PaneLeaf {
  kind: 'leaf';
  id: string; // PTY session id
  terminal: Terminal;
  fitAddon: FitAddon;
  container: HTMLDivElement;
  resizeObserver: ResizeObserver;
}

export interface PaneSplit {
  kind: 'split';
  direction: SplitDirection;
  ratio: number; // 0..1, ilk cocugun payi
  children: [PaneNode, PaneNode];
}

export type PaneNode = PaneLeaf | PaneSplit;

/**
 * Yeni bir PTY oturumu baslatir ve ona bagli bir xterm.js instance'ini bir
 * pane yaprağına (leaf) sarar. Her leaf'in kendi ResizeObserver'i vardir;
 * bu sayede pencere yeniden boyutlandirma, divider surukleme ve sekme
 * degistirme sonrasi container boyutu her degistiginde fit()+pty:resize
 * otomatik tetiklenir - ayri bir "resize" event zincirine gerek kalmaz.
 */
export async function createPaneLeaf(
  isReservedShortcut: (event: KeyboardEvent) => boolean,
  terminalTheme: ITheme
): Promise<PaneLeaf> {
  const { id } = await window.bitig.pty.create({ cols: 80, rows: 24 });

  const container = document.createElement('div');
  container.className = 'pane-leaf';

  const terminal = new Terminal({
    cursorBlink: true,
    cursorStyle: 'bar',
    fontFamily: "'Cascadia Code', 'Cascadia Mono', Consolas, monospace",
    fontSize: 14,
    lineHeight: 1.25,
    scrollback: 5000,
    theme: terminalTheme
  });

  const fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);
  terminal.loadAddon(new WebLinksAddon());
  terminal.open(container);

  terminal.attachCustomKeyEventHandler((event) => !isReservedShortcut(event));
  terminal.onData((data) => window.bitig.pty.write(id, data));

  let resizePending = false;
  const resizeObserver = new ResizeObserver(() => {
    // Bir ResizeObserver callback'i tek frame'de birden fazla entry
    // tasiyabilir; rAF ile bunlari tek bir fit()+resize cagrisina indiriyoruz.
    if (resizePending) return;
    resizePending = true;
    requestAnimationFrame(() => {
      resizePending = false;
      if (container.clientWidth === 0 || container.clientHeight === 0) return;
      fitAddon.fit();
      window.bitig.pty.resize(id, terminal.cols, terminal.rows);
    });
  });
  resizeObserver.observe(container);

  return { kind: 'leaf', id, terminal, fitAddon, container, resizeObserver };
}

export function disposePaneLeaf(leaf: PaneLeaf): void {
  leaf.resizeObserver.disconnect();
  window.bitig.pty.dispose(leaf.id);
  leaf.terminal.dispose();
  leaf.container.remove();
}

/** targetId'li leaf'i, yaninda newLeaf olacak sekilde bir split node'a cevirir. */
export function splitLeaf(
  root: PaneNode,
  targetId: string,
  direction: SplitDirection,
  newLeaf: PaneLeaf
): PaneNode {
  if (root.kind === 'leaf') {
    if (root.id !== targetId) return root;
    return { kind: 'split', direction, ratio: 0.5, children: [root, newLeaf] };
  }
  const [a, b] = root.children;
  return {
    ...root,
    children: [splitLeaf(a, targetId, direction, newLeaf), splitLeaf(b, targetId, direction, newLeaf)]
  };
}

/**
 * targetId'li leaf'i agactan cikarir. Ebeveyni split node'du ve tek cocuk
 * kaldiysa, kalan kardes yukari tasinir (split node kaybolur). Kok leaf'in
 * kendisi kapatiliyorsa null doner - cagiran bu durumda sekmenin tamamini
 * kapatmali.
 */
export function closeLeafFromTree(root: PaneNode, targetId: string): PaneNode | null {
  if (root.kind === 'leaf') return root.id === targetId ? null : root;

  const [a, b] = root.children;
  if (a.kind === 'leaf' && a.id === targetId) return b;
  if (b.kind === 'leaf' && b.id === targetId) return a;

  // Bu noktada a/b split node'lar (ya da hedefi icermeyen leaf'ler); null
  // sadece dogrudan leaf-esleme durumunda dondugu icin ?? asla devreye
  // girmez, ama TS'in null olmayan tuple tipini saglamak icin burada.
  return { ...root, children: [closeLeafFromTree(a, targetId) ?? a, closeLeafFromTree(b, targetId) ?? b] };
}

export function collectLeaves(root: PaneNode): PaneLeaf[] {
  if (root.kind === 'leaf') return [root];
  return [...collectLeaves(root.children[0]), ...collectLeaves(root.children[1])];
}

export function findLeaf(root: PaneNode, id: string): PaneLeaf | undefined {
  if (root.kind === 'leaf') return root.id === id ? root : undefined;
  return findLeaf(root.children[0], id) ?? findLeaf(root.children[1], id);
}

/**
 * Pane agacindan taze bir DOM alt-agaci uretir. Leaf container'lari
 * appendChild ile TASINIR (klonlanmaz) - bu yuzden xterm.js'in canvas'i ve
 * scrollback'i her yeniden cizimde (split/close sonrasi) korunur; sadece
 * split sarmalayicilari ve divider'lar yeniden olusturulur.
 */
export function renderPaneTree(
  root: PaneNode,
  activeLeafId: string,
  highlightActive: boolean,
  onFocusLeaf: (id: string) => void
): HTMLElement {
  if (root.kind === 'leaf') {
    root.container.classList.toggle('pane-leaf-active', highlightActive && root.id === activeLeafId);
    // addEventListener yerine ozellik atamasi kullaniyoruz: container her
    // renderPaneTree cagrisinda ayni kalir, addEventListener kullansaydik
    // her cagri eski dinleyicinin ustune yenisini yigar (onFocusLeaf art
    // arda birden fazla kez tetiklenirdi).
    root.container.onmousedown = () => onFocusLeaf(root.id);
    return root.container;
  }

  const wrapper = document.createElement('div');
  wrapper.className = `pane-split pane-split-${root.direction}`;

  const [a, b] = root.children;

  const aSlot = document.createElement('div');
  aSlot.className = 'pane-slot';
  aSlot.style.flexGrow = String(root.ratio);
  aSlot.appendChild(renderPaneTree(a, activeLeafId, highlightActive, onFocusLeaf));

  const bSlot = document.createElement('div');
  bSlot.className = 'pane-slot';
  bSlot.style.flexGrow = String(1 - root.ratio);
  bSlot.appendChild(renderPaneTree(b, activeLeafId, highlightActive, onFocusLeaf));

  const divider = document.createElement('div');
  divider.className = `pane-divider pane-divider-${root.direction}`;
  wirePaneDivider(divider, wrapper, root, aSlot, bSlot);

  wrapper.append(aSlot, divider, bSlot);
  return wrapper;
}

/**
 * Divider'i surukleyerek split oranini degistirir. aSlot/bSlot'un
 * flexGrow'unu canli guncelleriz; bu, ilgili leaf container'larinin gercek
 * boyutunu degistirir ve her leaf'in kendi ResizeObserver'i bunu yakalayip
 * fit()+pty:resize'i otomatik tetikler - burada ayrica cagirmaya gerek yok.
 */
function wirePaneDivider(
  divider: HTMLDivElement,
  wrapper: HTMLDivElement,
  splitNode: PaneSplit,
  aSlot: HTMLDivElement,
  bSlot: HTMLDivElement
): void {
  const MIN_FRACTION = 0.1;

  divider.addEventListener('mousedown', (event) => {
    event.preventDefault();
    const isRow = splitNode.direction === 'row';
    const rect = wrapper.getBoundingClientRect();
    const totalSize = isRow ? rect.width : rect.height;
    divider.classList.add('dragging');

    const onMouseMove = (moveEvent: MouseEvent): void => {
      const pos = isRow ? moveEvent.clientX - rect.left : moveEvent.clientY - rect.top;
      const ratio = Math.min(1 - MIN_FRACTION, Math.max(MIN_FRACTION, pos / totalSize));
      splitNode.ratio = ratio;
      aSlot.style.flexGrow = String(ratio);
      bSlot.style.flexGrow = String(1 - ratio);
    };

    const onMouseUp = (): void => {
      divider.classList.remove('dragging');
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });
}
