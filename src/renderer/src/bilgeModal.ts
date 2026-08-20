import type { TabStore } from './tabs';
import type { AiPromptResponse } from '../../shared/aiTypes';
import { icon } from './icons';

/**
 * Bitig Bilge (AI Assistant - Ctrl+I):
 * Natural-language command generation, error explanation, and direct-to-terminal
 * injection modal. Privacy-first architecture: 100% local (Ollama) or BYOK
 * (OpenAI/Anthropic/Gemini/DeepSeek).
 */
export class BilgeModal {
  private isOpen = false;
  private isLoading = false;
  private currentResponse: AiPromptResponse | null = null;
  /** Bumped on every submit; guards against a slow/late response overwriting a newer one. */
  private requestGeneration = 0;

  private readonly backdropEl: HTMLDivElement;
  private readonly modalEl: HTMLDivElement;
  private readonly inputEl: HTMLInputElement;
  private readonly statusBadgeEl: HTMLSpanElement;
  private readonly previewContainerEl: HTMLDivElement;
  private readonly commandCodeEl: HTMLElement;
  private readonly explanationEl: HTMLDivElement;
  private readonly executeBtn: HTMLButtonElement;
  private readonly copyBtn: HTMLButtonElement;
  private readonly errorBannerEl: HTMLDivElement;

  constructor(
    private readonly rootEl: HTMLElement,
    private readonly tabStore: TabStore
  ) {
    this.backdropEl = document.createElement('div');
    this.backdropEl.className = 'bilge-backdrop hidden';

    this.modalEl = document.createElement('div');
    this.modalEl.className = 'bilge-modal';

    // Header
    const header = document.createElement('div');
    header.className = 'bilge-header';

    const titleWrap = document.createElement('div');
    titleWrap.className = 'bilge-title-wrap';
    titleWrap.innerHTML = `
      <span class="bilge-icon">${icon('sparkle')}</span>
      <span class="bilge-title">Bitig Bilge</span>
    `;

    const rightWrap = document.createElement('div');
    rightWrap.className = 'bilge-header-right';

    this.statusBadgeEl = document.createElement('span');
    this.statusBadgeEl.className = 'bilge-status-badge';
    this.statusBadgeEl.textContent = 'Ollama / Local';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'bilge-close-btn';
    closeBtn.title = 'Close (Esc)';
    closeBtn.innerHTML = icon('x');
    closeBtn.addEventListener('click', () => this.close());

    rightWrap.append(this.statusBadgeEl, closeBtn);
    header.append(titleWrap, rightWrap);

    // Input row
    const inputRow = document.createElement('div');
    inputRow.className = 'bilge-input-row';

    this.inputEl = document.createElement('input');
    this.inputEl.type = 'text';
    this.inputEl.className = 'bilge-input';
    this.inputEl.placeholder = 'What do you want to do? (e.g. find files over 100MB, list Docker containers)';
    this.inputEl.spellcheck = false;

    inputRow.appendChild(this.inputEl);

    // Error banner
    this.errorBannerEl = document.createElement('div');
    this.errorBannerEl.className = 'bilge-error-banner hidden';

    // Preview Container (Result)
    this.previewContainerEl = document.createElement('div');
    this.previewContainerEl.className = 'bilge-preview hidden';

    const cmdBox = document.createElement('div');
    cmdBox.className = 'bilge-command-box';
    this.commandCodeEl = document.createElement('code');
    this.commandCodeEl.className = 'bilge-command-code';
    cmdBox.appendChild(this.commandCodeEl);

    this.explanationEl = document.createElement('div');
    this.explanationEl.className = 'bilge-explanation';

    this.previewContainerEl.append(cmdBox, this.explanationEl);

    // Footer actions
    const footer = document.createElement('div');
    footer.className = 'bilge-footer';

    const hint = document.createElement('span');
    hint.className = 'bilge-hint';
    hint.textContent = 'Enter Send/Run | Tab Edit | Esc Close';

    const actions = document.createElement('div');
    actions.className = 'bilge-actions';

    this.copyBtn = document.createElement('button');
    this.copyBtn.className = 'bilge-btn bilge-btn-secondary hidden';
    this.copyBtn.textContent = 'Copy';
    this.copyBtn.addEventListener('click', () => {
      if (this.currentResponse?.command) {
        void navigator.clipboard.writeText(this.currentResponse.command);
        this.copyBtn.textContent = 'Copied!';
        setTimeout(() => {
          this.copyBtn.textContent = 'Copy';
        }, 1500);
      }
    });

    this.executeBtn = document.createElement('button');
    this.executeBtn.className = 'bilge-btn bilge-btn-primary hidden';
    this.executeBtn.textContent = 'Run (Enter)';
    this.executeBtn.addEventListener('click', () => this.injectAndExecute(true));

    actions.append(this.copyBtn, this.executeBtn);
    footer.append(hint, actions);

    this.modalEl.append(header, inputRow, this.errorBannerEl, this.previewContainerEl, footer);
    this.backdropEl.appendChild(this.modalEl);
    this.rootEl.appendChild(this.backdropEl);

    this.inputEl.addEventListener('keydown', (e) => this.handleKeydown(e));
    this.backdropEl.addEventListener('click', (e) => {
      if (e.target === this.backdropEl) this.close();
    });
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else void this.open();
  }

  async open(initialQuery?: string): Promise<void> {
    this.isOpen = true;
    this.currentResponse = null;
    this.inputEl.value = initialQuery || '';
    this.errorBannerEl.classList.add('hidden');
    this.previewContainerEl.classList.add('hidden');
    this.executeBtn.classList.add('hidden');
    this.copyBtn.classList.add('hidden');
    this.backdropEl.classList.remove('hidden');

    document.addEventListener('keydown', this.handleDocKeydown, true);
    await this.updateStatusBadge();
    setTimeout(() => this.inputEl.focus(), 50);

    if (initialQuery) {
      void this.submitQuery();
    }
  }

  close(): void {
    this.isOpen = false;
    this.backdropEl.classList.add('hidden');
    document.removeEventListener('keydown', this.handleDocKeydown, true);
  }

  private readonly handleDocKeydown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      e.preventDefault();
      this.close();
    }
  };

  private async updateStatusBadge(): Promise<void> {
    try {
      const settings = await window.bitig.settings.get();
      const ai = settings.ai;
      if (!ai?.enabled) {
        this.statusBadgeEl.textContent = 'Disabled';
        this.statusBadgeEl.className = 'bilge-status-badge disabled';
      } else {
        this.statusBadgeEl.textContent = `${ai.provider.toUpperCase()} (${ai.model || 'default'})`;
        this.statusBadgeEl.className = 'bilge-status-badge active';
      }
    } catch {
      this.statusBadgeEl.textContent = 'AI Service';
    }
  }

  private handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      this.close();
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (this.currentResponse?.command && !this.isLoading) {
        this.injectAndExecute(true);
      } else if (!this.isLoading && this.inputEl.value.trim()) {
        void this.submitQuery();
      }
      return;
    }

    if (e.key === 'Tab') {
      if (this.currentResponse?.command) {
        e.preventDefault();
        this.injectAndExecute(false);
      }
    }
  }

  private setLoadingState(loading: boolean): void {
    this.isLoading = loading;
    this.inputEl.disabled = loading;
    this.executeBtn.disabled = loading;
    this.copyBtn.disabled = loading;
  }

  private async submitQuery(): Promise<void> {
    const query = this.inputEl.value.trim();
    if (!query || this.isLoading) return;

    const generation = ++this.requestGeneration;
    this.setLoadingState(true);
    this.errorBannerEl.classList.add('hidden');
    this.statusBadgeEl.textContent = 'Thinking...';
    this.statusBadgeEl.classList.add('loading');

    const context = this.tabStore.getActiveShellContext();

    try {
      const res = await window.bitig.ai.prompt({
        userQuery: query,
        shellType: context.shellType,
        cwd: context.cwd
      });

      // A newer request superseded this one (modal was reopened/resubmitted) - drop this response.
      if (generation !== this.requestGeneration || !this.isOpen) return;

      this.setLoadingState(false);
      await this.updateStatusBadge();

      if (!res.success || !res.command) {
        this.errorBannerEl.textContent = res.error || 'Could not generate a command.';
        this.errorBannerEl.classList.remove('hidden');
        this.previewContainerEl.classList.add('hidden');
        return;
      }

      this.currentResponse = res;
      this.commandCodeEl.textContent = res.command;
      this.explanationEl.textContent = res.explanation || '';
      this.previewContainerEl.classList.remove('hidden');
      this.executeBtn.classList.remove('hidden');
      this.copyBtn.classList.remove('hidden');
    } catch (err) {
      if (generation !== this.requestGeneration || !this.isOpen) return;
      this.setLoadingState(false);
      await this.updateStatusBadge();
      this.errorBannerEl.textContent = `Error: ${(err as Error).message || String(err)}`;
      this.errorBannerEl.classList.remove('hidden');
    }
  }

  private injectAndExecute(autoEnter: boolean): void {
    if (!this.currentResponse?.command) return;
    const cmd = this.currentResponse.command;
    this.close();
    this.tabStore.writeToActivePane(autoEnter ? `${cmd}\r` : cmd);
  }
}
