/**
 * Terminal icinde sag tiklandiginda acilan modern, cam efektli
 * (glassmorphic) baglam menusu bileşeni.
 */

export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: string;
  shortcut?: string;
  disabled?: boolean;
  action: () => void;
}

export class TerminalContextMenu {
  private menuEl: HTMLElement;
  private isOpen = false;

  constructor(private readonly container: HTMLElement) {
    this.menuEl = document.createElement('div');
    this.menuEl.className = 'bitig-context-menu hidden';
    this.container.appendChild(this.menuEl);

    document.addEventListener('click', (e) => {
      if (this.isOpen && !this.menuEl.contains(e.target as Node)) {
        this.close();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (this.isOpen && e.key === 'Escape') {
        this.close();
      }
    });

    window.addEventListener('resize', () => {
      if (this.isOpen) this.close();
    });
  }

  show(x: number, y: number, items: ContextMenuItem[]): void {
    this.menuEl.replaceChildren();

    for (const item of items) {
      if (item.id === 'separator') {
        const sep = document.createElement('div');
        sep.className = 'bitig-context-menu-separator';
        this.menuEl.appendChild(sep);
        continue;
      }

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'bitig-context-menu-item';
      if (item.disabled) btn.disabled = true;

      btn.innerHTML = `
        <span class="context-menu-left">
          ${item.icon ? `<span class="context-menu-icon">${item.icon}</span>` : ''}
          <span class="context-menu-label">${item.label}</span>
        </span>
        ${item.shortcut ? `<span class="context-menu-shortcut">${item.shortcut}</span>` : ''}
      `;

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.close();
        item.action();
      });

      this.menuEl.appendChild(btn);
    }

    this.menuEl.classList.remove('hidden');
    this.isOpen = true;

    // Ekran sinirlarini kontrol et
    requestAnimationFrame(() => {
      const rect = this.menuEl.getBoundingClientRect();
      const maxX = window.innerWidth - rect.width - 8;
      const maxY = window.innerHeight - rect.height - 8;

      const posX = Math.max(8, Math.min(x, maxX));
      const posY = Math.max(8, Math.min(y, maxY));

      this.menuEl.style.left = `${posX}px`;
      this.menuEl.style.top = `${posY}px`;
    });
  }

  close(): void {
    if (!this.isOpen) return;
    this.menuEl.classList.add('hidden');
    this.isOpen = false;
  }
}
