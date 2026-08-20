/**
 * Sekme veya pencere kapatilirken aktif islemler varsa kullaniciya
 * onay soran modern cam efektli onay diyaloğu.
 */

export class ConfirmModal {
  private modalEl: HTMLElement;
  private resolveCb: ((value: boolean) => void) | null = null;

  constructor(private readonly container: HTMLElement) {
    this.modalEl = document.createElement('div');
    this.modalEl.className = 'bitig-confirm-overlay hidden';
    this.container.appendChild(this.modalEl);

    this.modalEl.addEventListener('click', (e) => {
      if (e.target === this.modalEl) {
        this.cancel();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (!this.modalEl.classList.contains('hidden') && e.key === 'Escape') {
        this.cancel();
      }
    });
  }

  confirm(title: string, message: string, confirmLabel = 'Confirm', danger = true): Promise<boolean> {
    return new Promise((resolve) => {
      this.resolveCb = resolve;

      this.modalEl.innerHTML = `
        <div class="bitig-confirm-card">
          <div class="bitig-confirm-header">
            <div class="bitig-confirm-icon ${danger ? 'danger' : 'warning'}">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
            </div>
            <h3 class="bitig-confirm-title">${title}</h3>
          </div>
          <p class="bitig-confirm-message">${message}</p>
          <div class="bitig-confirm-actions">
            <button type="button" class="bitig-confirm-btn cancel" id="confirm-btn-cancel">Cancel</button>
            <button type="button" class="bitig-confirm-btn ${danger ? 'danger' : 'primary'}" id="confirm-btn-ok">${confirmLabel}</button>
          </div>
        </div>
      `;

      this.modalEl.classList.remove('hidden');

      const okBtn = this.modalEl.querySelector('#confirm-btn-ok') as HTMLButtonElement;
      const cancelBtn = this.modalEl.querySelector('#confirm-btn-cancel') as HTMLButtonElement;

      okBtn?.focus();

      okBtn?.addEventListener('click', () => {
        this.close(true);
      });

      cancelBtn?.addEventListener('click', () => {
        this.close(false);
      });
    });
  }

  private cancel(): void {
    this.close(false);
  }

  private close(result: boolean): void {
    this.modalEl.classList.add('hidden');
    if (this.resolveCb) {
      this.resolveCb(result);
      this.resolveCb = null;
    }
  }
}
