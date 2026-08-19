import { Terminal, type ITheme } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { SearchAddon } from '@xterm/addon-search';
import { registerSmartLinks } from './smartLinks';

export type SplitDirection = 'row' | 'column';

export interface PaneLeaf {
  kind: 'leaf';
  id: string; // PTY session id
  terminal: Terminal;
  fitAddon: FitAddon;
  searchAddon: SearchAddon;
  container: HTMLDivElement;
  resizeObserver: ResizeObserver;
  cwd?: string;
  title?: string;
}

export interface PaneSplit {
  kind: 'split';
  direction: SplitDirection;
  ratio: number; // 0..1, ilk cocugun payi
  children: [PaneNode, PaneNode];
}

export type PaneNode = PaneLeaf | PaneSplit;

export interface TerminalFontOptions {
  /** Yedek zinciri eklenmis, hazir CSS font-family degeri. */
  fontFamily: string;
  fontSize: number;
}

export interface CreatePaneLeafOptions {
  command?: string;
  args?: string[];
  cwd?: string;
  onInput?: (data: string) => void;
}

export async function createPaneLeaf(
  isReservedShortcut: (event: KeyboardEvent) => boolean,
  terminalTheme: ITheme,
  font: TerminalFontOptions,
  options?: CreatePaneLeafOptions
): Promise<PaneLeaf> {
  const { id } = await window.bitig.pty.create({
    cols: 80,
    rows: 24,
    command: options?.command,
    args: options?.args,
    cwd: options?.cwd
  });

  const container = document.createElement('div');
  container.className = 'pane-leaf';

  const terminal = new Terminal({
    cursorBlink: true,
    cursorStyle: 'bar',
    fontFamily: font.fontFamily,
    fontSize: font.fontSize,
    lineHeight: 1.25,
    scrollback: 5000,
    allowTransparency: true,
    theme: terminalTheme
  });

  const fitAddon = new FitAddon();
  const searchAddon = new SearchAddon();
  terminal.loadAddon(fitAddon);
  terminal.loadAddon(searchAddon);
  terminal.loadAddon(new WebLinksAddon());
  terminal.open(container);

  terminal.attachCustomKeyEventHandler((event) => !isReservedShortcut(event));
  terminal.onData((data) => {
    options?.onInput?.(data);
    window.bitig.pty.write(id, data);
  });

  const leaf: PaneLeaf = {
    kind: 'leaf',
    id,
    terminal,
    fitAddon,
    searchAddon,
    container,
    resizeObserver: null as unknown as ResizeObserver,
    cwd: options?.cwd
  };

  registerSmartLinks(terminal, () => leaf.cwd);

  // OSC 7 calisma dizini (CWD) takibi
  try {
    terminal.parser.registerOscHandler(7, (data) => {
      let pathStr = data;
      if (pathStr.startsWith('file://')) {
        try {
          const url = new URL(pathStr);
          pathStr = decodeURIComponent(url.pathname);
          if (pathStr.startsWith('/') && pathStr.includes(':')) {
            pathStr = pathStr.slice(1);
          }
        } catch {
          pathStr = pathStr.replace(/^file:\/\/[^/]+/, '');
        }
      }
      if (pathStr) {
        leaf.cwd = pathStr;
      }
      return true;
    });
  } catch {
    // OSC 7 parser desteklenmiyorsa sessizce gec
  }

  let resizePending = false;
  const resizeObserver = new ResizeObserver(() => {
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
  leaf.resizeObserver = resizeObserver;

  return leaf;
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
 * kaldiysa, kalan kardes yukari tasinir. Kok leaf kapatiliyorsa null doner.
 */
export function closeLeafFromTree(root: PaneNode, targetId: string): PaneNode | null {
  if (root.kind === 'leaf') return root.id === targetId ? null : root;

  const [a, b] = root.children;
  if (a.kind === 'leaf' && a.id === targetId) return b;
  if (b.kind === 'leaf' && b.id === targetId) return a;

  return {
    ...root,
    children: [closeLeafFromTree(a, targetId) ?? a, closeLeafFromTree(b, targetId) ?? b]
  };
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
 * Yonsel pane odaklama (Alt+Left/Right/Up/Down).
 * Ekranda cizili pane'lerin merkez koordinatlarini karsilastirarak
 * istenen yondeki en yakin komsu leaf'in id'sini bulur.
 */
export function navigateDirection(
  root: PaneNode,
  activeLeafId: string,
  direction: 'left' | 'right' | 'up' | 'down'
): string | null {
  const leaves = collectLeaves(root);
  if (leaves.length < 2) return null;

  const activeLeaf = leaves.find((l) => l.id === activeLeafId);
  if (!activeLeaf) return null;

  const activeRect = activeLeaf.container.getBoundingClientRect();
  const activeCenter = {
    x: activeRect.left + activeRect.width / 2,
    y: activeRect.top + activeRect.height / 2
  };

  let bestId: string | null = null;
  let bestScore = Infinity;

  for (const candidate of leaves) {
    if (candidate.id === activeLeafId) continue;
    const rect = candidate.container.getBoundingClientRect();
    const center = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    };

    const dx = center.x - activeCenter.x;
    const dy = center.y - activeCenter.y;

    let isMatch = false;
    let primaryDist = 0;
    let crossDist = 0;

    switch (direction) {
      case 'left':
        if (dx < -5) {
          isMatch = true;
          primaryDist = -dx;
          crossDist = Math.abs(dy);
        }
        break;
      case 'right':
        if (dx > 5) {
          isMatch = true;
          primaryDist = dx;
          crossDist = Math.abs(dy);
        }
        break;
      case 'up':
        if (dy < -5) {
          isMatch = true;
          primaryDist = -dy;
          crossDist = Math.abs(dx);
        }
        break;
      case 'down':
        if (dy > 5) {
          isMatch = true;
          primaryDist = dy;
          crossDist = Math.abs(dx);
        }
        break;
    }

    if (isMatch) {
      // Birincil eksen mesafesi + capraz eksen agirligi
      const score = primaryDist + crossDist * 1.5;
      if (score < bestScore) {
        bestScore = score;
        bestId = candidate.id;
      }
    }
  }

  return bestId;
}

/**
 * Pane agacindan DOM alt-agaci uretir.
 * isZoomed true ise sadece aktif leaf gorunur, digerleri gizlenir.
 */
export function renderPaneTree(
  root: PaneNode,
  activeLeafId: string,
  highlightActive: boolean,
  onFocusLeaf: (id: string) => void,
  isZoomed = false
): HTMLElement {
  if (isZoomed) {
    const activeLeaf = findLeaf(root, activeLeafId) || collectLeaves(root)[0];
    if (activeLeaf) {
      activeLeaf.container.classList.remove('pane-leaf-zoomed-hidden');
      activeLeaf.container.classList.add('pane-leaf-zoomed');
      activeLeaf.container.classList.remove('pane-leaf-active');
      activeLeaf.container.onmousedown = () => onFocusLeaf(activeLeaf.id);
      return activeLeaf.container;
    }
  }

  return renderPaneNodeInternal(root, activeLeafId, highlightActive, onFocusLeaf);
}

function renderPaneNodeInternal(
  node: PaneNode,
  activeLeafId: string,
  highlightActive: boolean,
  onFocusLeaf: (id: string) => void
): HTMLElement {
  if (node.kind === 'leaf') {
    node.container.classList.remove('pane-leaf-zoomed');
    node.container.classList.remove('pane-leaf-zoomed-hidden');
    node.container.classList.toggle('pane-leaf-active', highlightActive && node.id === activeLeafId);
    node.container.onmousedown = () => onFocusLeaf(node.id);
    return node.container;
  }

  const wrapper = document.createElement('div');
  wrapper.className = `pane-split pane-split-${node.direction}`;

  const [a, b] = node.children;

  const aSlot = document.createElement('div');
  aSlot.className = 'pane-slot';
  aSlot.style.flexGrow = String(node.ratio);
  aSlot.appendChild(renderPaneNodeInternal(a, activeLeafId, highlightActive, onFocusLeaf));

  const bSlot = document.createElement('div');
  bSlot.className = 'pane-slot';
  bSlot.style.flexGrow = String(1 - node.ratio);
  bSlot.appendChild(renderPaneNodeInternal(b, activeLeafId, highlightActive, onFocusLeaf));

  const divider = document.createElement('div');
  divider.className = `pane-divider pane-divider-${node.direction}`;
  wirePaneDivider(divider, wrapper, node, aSlot, bSlot);

  wrapper.append(aSlot, divider, bSlot);
  return wrapper;
}

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
