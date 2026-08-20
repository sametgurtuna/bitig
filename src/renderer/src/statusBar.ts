/**
 * Alt Durum Cubugu (Status Bar) bileseni.
 *
 * Terminalin altinda calisan shell profili, aktif panel, acik portlar,
 * imlec koordinatlari ve AI Bilge durumunu gosterir.
 */

import type { StatusBarWidgetContribution } from '../../shared/pluginTypes';
import { icon } from './icons';

export interface StatusBarCallbacks {
  onOpenPort: (port: number) => void;
  onToggleBroadcast: () => void;
  onOpenBilge: () => void;
}

export class StatusBar {
  private el: HTMLElement;
  private profileEl: HTMLElement;
  private paneEl: HTMLElement;
  private portsContainerEl: HTMLElement;
  private pluginsContainerEl: HTMLElement;
  private broadcastEl: HTMLElement;
  private cursorEl: HTMLElement;
  private bilgeEl: HTMLElement;

  constructor(
    private readonly container: HTMLElement,
    private readonly callbacks: StatusBarCallbacks
  ) {
    this.el = document.createElement('footer');
    this.el.id = 'status-bar';
    this.el.className = 'bitig-status-bar';

    this.el.innerHTML = `
      <div class="status-bar-left">
        <div class="status-bar-item status-bar-profile" id="status-profile" title="Active Shell Profile">
          <span class="status-profile-dot" id="status-profile-dot"></span>
          <span class="status-profile-name" id="status-profile-name">PowerShell</span>
        </div>
        <div class="status-bar-item status-bar-pane" id="status-pane" title="Active Pane Info">
          <span id="status-pane-text">Pane 1/1</span>
        </div>
      </div>

      <div class="status-bar-center">
        <div class="status-bar-ports hidden" id="status-ports"></div>
        <button type="button" class="status-bar-item status-bar-broadcast hidden" id="status-broadcast" title="Toggle Broadcast Input Mode (Alt+Shift+I)">
          <span class="status-broadcast-dot"></span>
          <span>Sync Active</span>
        </button>
      </div>

      <div class="status-bar-right">
        <div class="status-bar-plugins" id="status-plugins"></div>
        <div class="status-bar-item status-bar-encoding" title="Character Encoding">UTF-8</div>
        <div class="status-bar-item status-bar-cursor" id="status-cursor" title="Cursor Position (Line, Column)">Ln 1, Col 1</div>
        <button type="button" class="status-bar-item status-bar-bilge" id="status-bilge" title="Bitig Bilge AI Assistant (Ctrl+I)">
          <span class="status-bilge-icon">${icon('sparkle')}</span>
          <span>Bilge AI</span>
        </button>
      </div>
    `;

    this.container.appendChild(this.el);

    this.profileEl = this.el.querySelector('#status-profile-name')!;
    this.paneEl = this.el.querySelector('#status-pane-text')!;
    this.portsContainerEl = this.el.querySelector('#status-ports')!;
    this.pluginsContainerEl = this.el.querySelector('#status-plugins')!;
    this.broadcastEl = this.el.querySelector('#status-broadcast')!;
    this.cursorEl = this.el.querySelector('#status-cursor')!;
    this.bilgeEl = this.el.querySelector('#status-bilge')!;

    this.broadcastEl.addEventListener('click', () => this.callbacks.onToggleBroadcast());
    this.bilgeEl.addEventListener('click', () => this.callbacks.onOpenBilge());
  }

  updatePluginWidgets(widgets: StatusBarWidgetContribution[]): void {
    this.pluginsContainerEl.replaceChildren();
    for (const w of widgets) {
      const widgetEl = document.createElement('div');
      widgetEl.className = 'status-bar-item status-plugin-widget';
      if (w.tooltip) widgetEl.title = w.tooltip;
      if (w.color) widgetEl.style.color = w.color;
      widgetEl.textContent = w.label;
      this.pluginsContainerEl.appendChild(widgetEl);
    }
  }

  updateProfile(name: string, color?: string): void {
    this.profileEl.textContent = name;
    const dot = this.el.querySelector('#status-profile-dot') as HTMLElement;
    if (dot) {
      dot.style.background = color || '#7dd3fc';
    }
  }

  updatePanes(activePaneIndex: number, totalPanes: number, isZoomed = false): void {
    if (isZoomed) {
      this.paneEl.innerHTML = icon('expand') + `<span>Pane ${activePaneIndex + 1}/${totalPanes}</span>`;
    } else {
      this.paneEl.textContent = `Pane ${activePaneIndex + 1}/${totalPanes}`;
    }
  }

  updateCursor(line: number, col: number): void {
    this.cursorEl.textContent = `Ln ${line}, Col ${col}`;
  }

  updatePorts(ports: number[]): void {
    this.portsContainerEl.replaceChildren();
    if (ports.length === 0) {
      this.portsContainerEl.classList.add('hidden');
      return;
    }

    this.portsContainerEl.classList.remove('hidden');
    for (const port of ports) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'status-port-badge';
      btn.title = `Open http://localhost:${port} in default browser`;
      btn.innerHTML = `<span class="status-port-dot"></span><span>:${port}</span>`;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.callbacks.onOpenPort(port);
      });
      this.portsContainerEl.appendChild(btn);
    }
  }

  updateBroadcast(isActive: boolean): void {
    if (isActive) {
      this.broadcastEl.classList.remove('hidden');
    } else {
      this.broadcastEl.classList.add('hidden');
    }
  }

  setVisible(visible: boolean): void {
    if (visible) {
      this.el.classList.remove('hidden');
    } else {
      this.el.classList.add('hidden');
    }
  }
}
