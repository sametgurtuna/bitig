import { buildFontStack, type AppearanceController } from './appearance';
import { loadUsableFonts, type FontInfo } from './fonts';
import type { BitigTheme } from '../../shared/themeTypes';
import type { BackgroundImageFit, BitigSettings } from '../../shared/settingsTypes';
import {
  ACTION_DEFINITIONS,
  normalizeKeyCombo,
  type ActionCategory,
  type ActionId
} from '../../shared/actionTypes';
import { DEFAULT_AI_SETTINGS, type AiProviderType } from '../../shared/aiTypes';
import type { KeybindingManager } from './keybindings';
import { icon } from './icons';

const FIT_LABELS: Record<BackgroundImageFit, string> = {
  cover: 'Cover',
  contain: 'Contain',
  center: 'Center',
  tile: 'Tile'
};

/** Sample Nerd Font icons shown in the preview (Powerline + Devicons). */
const NERD_FONT_SAMPLE_ICONS = '\uE0B0  \uE706  \uF09B  \uF07B  \uE62B  \uF120';

/**
 * A settings panel similar to Windows Terminal's own: opened via the gear
 * button in the title bar, replaces #terminal-shell in place. Covers
 * Appearance, Shell Profiles, Font, and Keyboard Shortcuts sections.
 */
/** Left-rail navigation groups; order here is the order shown in the sidebar. */
const NAV_GROUPS: { id: string; label: string; icon: string }[] = [
  { id: 'appearance', label: 'Appearance', icon: icon('palette') },
  { id: 'terminal', label: 'Terminal', icon: icon('terminal') },
  { id: 'keyboard', label: 'Keyboard', icon: icon('keyboard') },
  { id: 'ai', label: 'Bitig Bilge', icon: icon('sparkle') },
  { id: 'cockpit', label: 'Cockpit', icon: icon('radar') },
  { id: 'notifications', label: 'Notifications', icon: icon('bell') },
  { id: 'plugins', label: 'Plugins', icon: icon('plug') }
];

export class SettingsPanel {
  private isOpen = false;
  // The font list requires spawning PowerShell + hundreds of canvas
  // measurements; it's loaded once on first open, not on every render.
  private fonts: FontInfo[] | null = null;
  private fontsLoading = false;
  private recordingActionId: ActionId | null = null;
  // Which nav group is showing; persists across re-renders (theme changes,
  // slider drags, etc.) so the panel doesn't jump back to the top.
  private activeGroup: string = NAV_GROUPS[0].id;

  constructor(
    private readonly panelEl: HTMLElement,
    private readonly terminalShellEl: HTMLElement,
    private readonly toggleBtn: HTMLButtonElement,
    private readonly appearance: AppearanceController,
    private readonly keybindings: KeybindingManager
  ) {
    this.toggleBtn.addEventListener('click', () => this.toggle());
    this.appearance.onChange(() => {
      if (this.isOpen) this.render();
    });
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  open(): void {
    this.isOpen = true;
    this.recordingActionId = null;
    this.terminalShellEl.classList.add('hidden');
    this.panelEl.classList.remove('hidden');
    this.toggleBtn.classList.add('active');
    document.addEventListener('keydown', this.handleKeydown, true);
    this.render();
    void this.ensureFontsLoaded();
  }

  /** Loads the font list once; re-renders the panel when done. */
  private async ensureFontsLoaded(): Promise<void> {
    if (this.fonts || this.fontsLoading) return;
    this.fontsLoading = true;
    try {
      const selected = this.appearance.getState()?.settings.terminal.fontFamily;
      this.fonts = await loadUsableFonts(selected);
    } catch (error) {
      console.error(`[Bitig] Failed to load font list: ${String(error)}`);
      this.fonts = [];
    } finally {
      this.fontsLoading = false;
      if (this.isOpen) this.render();
    }
  }

  close(): void {
    this.isOpen = false;
    this.recordingActionId = null;
    this.panelEl.classList.add('hidden');
    this.terminalShellEl.classList.remove('hidden');
    this.toggleBtn.classList.remove('active');
    document.removeEventListener('keydown', this.handleKeydown, true);
  }

  private readonly handleKeydown = (event: KeyboardEvent): void => {
    // If a shortcut key is currently being recorded
    if (this.recordingActionId) {
      event.preventDefault();
      event.stopPropagation();

      // Escape alone cancels the recording
      if (event.key === 'Escape' && !event.ctrlKey && !event.altKey && !event.shiftKey) {
        this.recordingActionId = null;
        this.render();
        return;
      }

      const combo = normalizeKeyCombo(event);
      if (combo) {
        const actionId = this.recordingActionId;
        this.recordingActionId = null;
        window.bitig.settings.set({
          keybindings: { [actionId]: combo }
        });
      }
      return;
    }

    if (event.key === 'Escape') this.close();
  };

  private render(): void {
    const state = this.appearance.getState();
    if (!state) return;
    const { themes, settings } = state;

    const groupSections: Record<string, HTMLElement[]> = {
      appearance: [
        this.buildThemeSection(themes, settings),
        this.buildFontSection(settings),
        this.buildOpacitySection(settings),
        this.buildBackgroundImageSection(settings)
      ],
      terminal: [this.buildProfileSection(settings), this.buildTerminalAdvancedSection(settings)],
      keyboard: [this.buildKeybindingsSection(settings)],
      ai: [this.buildBilgeAiSection(settings)],
      cockpit: [this.buildCockpitSection(settings)],
      notifications: [this.buildTelemetrySection(settings)],
      plugins: [this.buildPluginsSection()]
    };

    const content = document.createElement('div');
    content.className = 'settings-content';
    for (const group of NAV_GROUPS) {
      const groupEl = document.createElement('div');
      groupEl.className = 'settings-group';
      groupEl.dataset.group = group.id;
      if (group.id !== this.activeGroup) groupEl.classList.add('hidden');
      groupEl.append(...(groupSections[group.id] || []));
      content.appendChild(groupEl);
    }
    content.appendChild(this.buildResetSection());

    const body = document.createElement('div');
    body.className = 'settings-body';
    body.append(this.buildNav(), content);

    this.panelEl.replaceChildren(this.buildHeader(), body);
  }

  /** The left icon rail; clicking a group swaps the visible section without
   *  rebuilding the whole panel (`render()` is still called, but each
   *  group's DOM was already built - only visibility toggles). */
  private buildNav(): HTMLElement {
    const nav = document.createElement('nav');
    nav.className = 'settings-nav';
    for (const group of NAV_GROUPS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'settings-nav-item' + (group.id === this.activeGroup ? ' active' : '');
      btn.innerHTML = `<span class="settings-nav-icon">${group.icon}</span><span class="settings-nav-label">${group.label}</span>`;
      btn.addEventListener('click', () => {
        if (this.activeGroup === group.id) return;
        this.activeGroup = group.id;
        this.render();
      });
      nav.appendChild(btn);
    }
    return nav;
  }

  private buildHeader(): HTMLElement {
    const header = document.createElement('div');
    header.className = 'settings-header';

    const title = document.createElement('h2');
    title.textContent = 'Settings';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'settings-close-btn';
    closeBtn.title = 'Close (Esc)';
    closeBtn.setAttribute('aria-label', 'Close settings');
    closeBtn.innerHTML = '<svg viewBox="0 0 10 10"><path d="M0 0l10 10M10 0L0 10" /></svg>';
    closeBtn.addEventListener('click', () => this.close());

    header.append(title, closeBtn);
    return header;
  }

  private buildProfileSection(settings: BitigSettings): HTMLElement {
    const section = this.buildSection('Shell Profiles');

    const desc = document.createElement('p');
    desc.className = 'settings-desc';
    desc.textContent = 'Choose the default shell to launch in new tabs and windows:';

    const row = document.createElement('div');
    row.className = 'settings-row';

    const label = document.createElement('label');
    label.className = 'settings-label';
    label.textContent = 'Default Profile';
    label.htmlFor = 'settings-default-profile-select';

    const select = document.createElement('select');
    select.id = 'settings-default-profile-select';
    select.className = 'settings-select';

    const profiles = settings.profiles || [];
    for (const profile of profiles) {
      const option = document.createElement('option');
      option.value = profile.id;
      option.textContent = profile.name;
      if (profile.id === settings.defaultProfileId) {
        option.selected = true;
      }
      select.appendChild(option);
    }

    select.addEventListener('change', () => {
      window.bitig.settings.set({ defaultProfileId: select.value });
    });

    row.append(label, select);

    const profileList = document.createElement('div');
    profileList.className = 'profile-badge-list';
    for (const p of profiles) {
      const badge = document.createElement('div');
      badge.className = 'profile-badge';
      badge.innerHTML = `
        <span class="profile-badge-dot" style="background: ${p.color || '#7dd3fc'}"></span>
        <span class="profile-badge-name">${p.name}</span>
        <span class="profile-badge-cmd">${p.command}</span>
      `;
      profileList.appendChild(badge);
    }

    section.append(desc, row, profileList);
    return section;
  }

  private buildTerminalAdvancedSection(settings: BitigSettings): HTMLElement {
    const section = this.buildSection('Terminal & Advanced Settings');

    const desc = document.createElement('p');
    desc.className = 'settings-desc';
    desc.textContent = 'Terminal behavior, status bar, copy/paste ergonomics, and session persistence:';

    // 1. Copy on Select
    const copyRow = document.createElement('div');
    copyRow.className = 'settings-row settings-toggle-row';
    const copyLabel = document.createElement('label');
    copyLabel.className = 'settings-label';
    copyLabel.textContent = 'Auto-Copy on Selection (PuTTY Style)';
    const copyToggle = document.createElement('input');
    copyToggle.type = 'checkbox';
    copyToggle.checked = Boolean(settings.terminal.copyOnSelect);
    copyToggle.addEventListener('change', () => {
      window.bitig.settings.set({ terminal: { copyOnSelect: copyToggle.checked } });
    });
    copyRow.append(copyLabel, copyToggle);

    // 2. Paste on Right Click
    const pasteRow = document.createElement('div');
    pasteRow.className = 'settings-row settings-toggle-row';
    const pasteLabel = document.createElement('label');
    pasteLabel.className = 'settings-label';
    pasteLabel.textContent = 'Paste Directly on Right-Click (Skip Context Menu)';
    const pasteToggle = document.createElement('input');
    pasteToggle.type = 'checkbox';
    pasteToggle.checked = Boolean(settings.terminal.pasteOnRightClick);
    pasteToggle.addEventListener('change', () => {
      window.bitig.settings.set({ terminal: { pasteOnRightClick: pasteToggle.checked } });
    });
    pasteRow.append(pasteLabel, pasteToggle);

    // 3. Confirm Before Close
    const confirmRow = document.createElement('div');
    confirmRow.className = 'settings-row settings-toggle-row';
    const confirmLabel = document.createElement('label');
    confirmLabel.className = 'settings-label';
    confirmLabel.textContent = 'Show Confirmation When Closing Active Sessions';
    const confirmToggle = document.createElement('input');
    confirmToggle.checked = settings.terminal.confirmBeforeClose !== false;
    confirmToggle.addEventListener('change', () => {
      window.bitig.settings.set({ terminal: { confirmBeforeClose: confirmToggle.checked } });
    });
    confirmRow.append(confirmLabel, confirmToggle);

    // 4. Restore Session on Launch
    const restoreRow = document.createElement('div');
    restoreRow.className = 'settings-row settings-toggle-row';
    const restoreLabel = document.createElement('label');
    restoreLabel.className = 'settings-label';
    restoreLabel.textContent = 'Restore Previous Tabs & Panes on Startup';
    const restoreToggle = document.createElement('input');
    restoreToggle.checked = Boolean(settings.terminal.restoreSession);
    restoreToggle.addEventListener('change', () => {
      window.bitig.settings.set({ terminal: { restoreSession: restoreToggle.checked } });
    });
    restoreRow.append(restoreLabel, restoreToggle);

    // 5. Show Status Bar
    const statusRow = document.createElement('div');
    statusRow.className = 'settings-row settings-toggle-row';
    const statusLabel = document.createElement('label');
    statusLabel.className = 'settings-label';
    statusLabel.textContent = 'Show Bottom Status Bar';
    const statusToggle = document.createElement('input');
    statusToggle.checked = settings.terminal.showStatusBar !== false;
    statusToggle.addEventListener('change', () => {
      window.bitig.settings.set({ terminal: { showStatusBar: statusToggle.checked } });
    });
    statusRow.append(statusLabel, statusToggle);

    // 6. Scrollback Buffer
    const scrollRow = document.createElement('div');
    scrollRow.className = 'settings-row';
    const scrollLabel = document.createElement('label');
    scrollLabel.className = 'settings-label';
    scrollLabel.textContent = 'Scrollback Buffer Size:';
    const scrollSelect = document.createElement('select');
    scrollSelect.className = 'settings-select';
    const scrollOptions = [5000, 10000, 20000, 50000];
    const currentScroll = settings.terminal.scrollback ?? 10000;
    for (const val of scrollOptions) {
      const opt = document.createElement('option');
      opt.value = String(val);
      opt.textContent = `${val.toLocaleString()} lines`;
      if (val === currentScroll) opt.selected = true;
      scrollSelect.appendChild(opt);
    }
    scrollSelect.addEventListener('change', () => {
      window.bitig.settings.set({ terminal: { scrollback: Number(scrollSelect.value) } });
    });
    scrollRow.append(scrollLabel, scrollSelect);

    section.append(desc, copyRow, pasteRow, confirmRow, restoreRow, statusRow, scrollRow);
    return section;
  }

  private buildPluginsSection(): HTMLElement {
    const section = this.buildSection('Plugins');

    const desc = document.createElement('p');
    desc.className = 'settings-desc';
    desc.textContent =
      'Extend Bitig with lightweight, sandboxed plugins located in %APPDATA%/Bitig/plugins/.';

    const actionRow = document.createElement('div');
    actionRow.className = 'settings-actions-row';

    const openDirBtn = document.createElement('button');
    openDirBtn.type = 'button';
    openDirBtn.className = 'settings-btn-secondary';
    openDirBtn.innerHTML = icon('folder') + '<span>Open Plugins Folder</span>';
    openDirBtn.addEventListener('click', () => {
      window.bitig.plugins.openDir();
    });

    const reloadBtn = document.createElement('button');
    reloadBtn.type = 'button';
    reloadBtn.className = 'settings-btn-secondary';
    reloadBtn.innerHTML = icon('refresh') + '<span>Reload Plugins</span>';

    actionRow.append(openDirBtn, reloadBtn);

    const pluginListContainer = document.createElement('div');
    pluginListContainer.className = 'plugin-list-container';
    pluginListContainer.innerHTML = '<span class="plugin-loading">Loading plugins...</span>';

    const renderPlugins = async (): Promise<void> => {
      try {
        const plugins = await window.bitig.plugins.list();
        pluginListContainer.replaceChildren();

        if (plugins.length === 0) {
          pluginListContainer.innerHTML = '<span class="plugin-empty">No plugins installed.</span>';
          return;
        }

        for (const p of plugins) {
          const card = document.createElement('div');
          card.className = 'plugin-card';
          if (!p.enabled) card.classList.add('disabled');

          const left = document.createElement('div');
          left.className = 'plugin-card-left';

          const titleWrap = document.createElement('div');
          titleWrap.className = 'plugin-title-wrap';

          const name = document.createElement('span');
          name.className = 'plugin-name';
          name.textContent = p.manifest.name;

          const ver = document.createElement('span');
          ver.className = 'plugin-version';
          ver.textContent = `v${p.manifest.version}`;

          titleWrap.append(name, ver);

          const descEl = document.createElement('p');
          descEl.className = 'plugin-desc';
          descEl.textContent = p.manifest.description || 'No description provided.';

          const meta = document.createElement('div');
          meta.className = 'plugin-meta';

          if (p.manifest.author) {
            const author = document.createElement('span');
            author.className = 'plugin-author';
            author.textContent = `Author: ${p.manifest.author}`;
            meta.appendChild(author);
          }

          if (p.manifest.permissions && p.manifest.permissions.length > 0) {
            for (const perm of p.manifest.permissions) {
              const pill = document.createElement('span');
              pill.className = 'plugin-perm-pill';
              pill.textContent = perm;
              meta.appendChild(pill);
            }
          }

          if (p.error) {
            const errEl = document.createElement('span');
            errEl.className = 'plugin-error-badge';
            errEl.title = p.error;
            errEl.innerHTML = icon('alert') + `<span>${p.error}</span>`;
            meta.appendChild(errEl);
          }

          left.append(titleWrap, descEl, meta);

          const right = document.createElement('div');
          right.className = 'plugin-card-right';

          const toggle = document.createElement('input');
          toggle.type = 'checkbox';
          toggle.checked = p.enabled;
          toggle.addEventListener('change', async () => {
            toggle.disabled = true;
            await window.bitig.plugins.toggle(p.id, toggle.checked);
            await renderPlugins();
          });

          right.appendChild(toggle);
          card.append(left, right);
          pluginListContainer.appendChild(card);
        }
      } catch (err) {
        pluginListContainer.innerHTML = `<span class="plugin-error">Failed to load plugins: ${String(err)}</span>`;
      }
    };

    reloadBtn.addEventListener('click', async () => {
      reloadBtn.disabled = true;
      reloadBtn.textContent = 'Reloading...';
      await window.bitig.plugins.reload();
      await renderPlugins();
      reloadBtn.disabled = false;
      reloadBtn.innerHTML = icon('refresh') + '<span>Reload Plugins</span>';
    });

    void renderPlugins();

    section.append(desc, actionRow, pluginListContainer);
    return section;
  }

  private buildKeybindingsSection(settings: BitigSettings): HTMLElement {
    const section = this.buildSection('Keyboard Shortcuts');

    const desc = document.createElement('p');
    desc.className = 'settings-desc';
    desc.textContent =
      'Customize keyboard shortcuts for terminal actions. Click a shortcut and press a new key combination to change it instantly.';

    section.appendChild(desc);

    const categories: ActionCategory[] = ['Tabs', 'Panes', 'View & Search', 'Application'];

    for (const cat of categories) {
      const catActions = ACTION_DEFINITIONS.filter((a) => a.category === cat);
      if (catActions.length === 0) continue;

      const catHeader = document.createElement('h4');
      catHeader.className = 'keybinding-cat-title';
      catHeader.textContent = cat;
      section.appendChild(catHeader);

      const table = document.createElement('div');
      table.className = 'keybinding-table';

      for (const def of catActions) {
        const currentKey = settings.keybindings?.[def.id] || def.defaultKeys;
        const isRecording = this.recordingActionId === def.id;
        const conflict = this.keybindings.findConflict(def.id, currentKey);

        const row = document.createElement('div');
        row.className = 'keybinding-row';
        if (isRecording) row.classList.add('recording-row');

        const info = document.createElement('div');
        info.className = 'keybinding-info';

        const name = document.createElement('span');
        name.className = 'keybinding-name';
        name.textContent = def.name;

        const actionDesc = document.createElement('span');
        actionDesc.className = 'keybinding-desc';
        actionDesc.textContent = def.description;

        info.append(name, actionDesc);

        const controls = document.createElement('div');
        controls.className = 'keybinding-controls';

        if (conflict) {
          const conflictBadge = document.createElement('span');
          conflictBadge.className = 'keybinding-conflict-badge';
          conflictBadge.title = `This shortcut conflicts with another action: ${conflict.name}`;
          conflictBadge.innerHTML = icon('alert') + `<span>Conflicts with ${conflict.name}</span>`;
          controls.appendChild(conflictBadge);
        }

        const keyBtn = document.createElement('button');
        keyBtn.type = 'button';
        keyBtn.className = `keybinding-btn ${isRecording ? 'recording' : ''}`;
        keyBtn.title = isRecording ? 'Press Esc to cancel' : 'Click to change';

        if (isRecording) {
          keyBtn.innerHTML = '<span class="recording-pulse"></span> Waiting for key...';
        } else {
          keyBtn.textContent = currentKey;
        }

        keyBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.recordingActionId = isRecording ? null : def.id;
          this.render();
        });

        controls.appendChild(keyBtn);

        // Reset-to-default button
        if (currentKey !== def.defaultKeys) {
          const resetBtn = document.createElement('button');
          resetBtn.type = 'button';
          resetBtn.className = 'keybinding-reset-btn';
          resetBtn.title = `Reset to default (${def.defaultKeys})`;
          resetBtn.innerHTML = icon('undo');
          resetBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            window.bitig.settings.set({
              keybindings: { [def.id]: def.defaultKeys }
            });
          });
          controls.appendChild(resetBtn);
        }

        row.append(info, controls);
        table.appendChild(row);
      }

      section.appendChild(table);
    }

    return section;
  }

  private buildThemeSection(themes: BitigTheme[], settings: BitigSettings): HTMLElement {
    const section = this.buildSection('Theme');

    const grid = document.createElement('div');
    grid.className = 'theme-grid';

    for (const theme of themes) {
      const card = document.createElement('button');
      card.className = 'theme-card';
      card.classList.toggle('active', theme.id === settings.activeTheme);
      card.type = 'button';

      const swatch = document.createElement('span');
      swatch.className = 'theme-swatch';
      swatch.style.background = theme.terminal.background;
      swatch.style.borderColor = theme.ui.border;
      const dot = document.createElement('span');
      dot.className = 'theme-swatch-dot';
      dot.style.background = theme.ui.accent;
      swatch.appendChild(dot);

      const label = document.createElement('span');
      label.className = 'theme-card-label';
      label.textContent = theme.name;

      card.append(swatch, label);
      card.addEventListener('click', () => {
        window.bitig.settings.set({ activeTheme: theme.id });
      });

      grid.appendChild(card);
    }

    section.appendChild(grid);
    return section;
  }

  private buildFontSection(settings: BitigSettings): HTMLElement {
    const section = this.buildSection('Font');
    const { fontFamily, fontSize } = settings.terminal;

    const familyRow = document.createElement('div');
    familyRow.className = 'settings-row';
    const familyLabel = document.createElement('label');
    familyLabel.textContent = 'Family';

    if (!this.fonts) {
      const loading = document.createElement('span');
      loading.className = 'settings-path-label';
      loading.textContent = 'Loading fonts...';
      familyRow.append(familyLabel, loading);
      section.appendChild(familyRow);
      return section;
    }

    const select = document.createElement('select');
    select.className = 'settings-select';
    if (this.fonts.length === 0) {
      const option = document.createElement('option');
      option.textContent = 'No fonts found';
      select.appendChild(option);
      select.disabled = true;
    }
    for (const font of this.fonts) {
      const option = document.createElement('option');
      option.value = font.family;
      // Flag Nerd Fonts right in the list, so the user can see which
      // options support icons before picking one.
      option.textContent = font.hasNerdGlyphs ? `${font.family}  (Nerd Font)` : font.family;
      option.selected = font.family === fontFamily;
      select.appendChild(option);
    }
    select.addEventListener('change', () => {
      window.bitig.settings.set({ terminal: { fontFamily: select.value } });
    });
    familyRow.append(familyLabel, select);
    section.appendChild(familyRow);

    const { row: sizeRow } = this.buildSlider({
      min: 8,
      max: 32,
      step: 1,
      value: fontSize,
      formatValue: (v) => `${v}px`,
      // Font size isn't a cheap CSS change like opacity - every step would
      // re-measure every terminal and send a PTY resize. So there's no
      // live preview, only applied once the drag ends.
      onInput: () => undefined,
      onCommit: (value) => window.bitig.settings.set({ terminal: { fontSize: value } })
    });
    const sizeLabel = document.createElement('label');
    sizeLabel.textContent = 'Size';
    sizeRow.prepend(sizeLabel);
    section.appendChild(sizeRow);

    section.appendChild(this.buildFontPreview(fontFamily, fontSize));
    return section;
  }

  /**
   * Live preview: sample text plus common Nerd Font icons rendered in the
   * selected font. If the icons render as tofu boxes, the user sees that
   * right here in settings instead of discovering it in a broken prompt.
   */
  private buildFontPreview(family: string, size: number): HTMLElement {
    const preview = document.createElement('div');
    preview.className = 'font-preview';
    preview.style.fontFamily = buildFontStack(family);
    preview.style.fontSize = `${size}px`;

    const textLine = document.createElement('div');
    textLine.textContent = 'PS C:\\Users\\dev> git status --short';

    const iconLine = document.createElement('div');
    iconLine.className = 'font-preview-icons';
    iconLine.textContent = NERD_FONT_SAMPLE_ICONS;

    preview.append(textLine, iconLine);

    const selected = this.fonts?.find((font) => font.family === family);
    if (selected && !selected.hasNerdGlyphs) {
      const notice = document.createElement('p');
      notice.className = 'font-notice';
      notice.textContent =
        "This font doesn't include Nerd Font icons; the icon row above will show empty boxes. If you use an icon-based prompt, you can install an icon-patched version from ";
      const link = document.createElement('a');
      link.href = 'https://www.nerdfonts.com/';
      link.textContent = 'nerdfonts.com';
      // Without target="_blank" the click would navigate the renderer
      // itself away from the app; this way main's setWindowOpenHandler
      // kicks in and opens the link in the default browser (see main/index.ts).
      link.target = '_blank';
      link.rel = 'noreferrer';
      notice.append(link, document.createTextNode('.'));
      preview.appendChild(notice);
    }

    return preview;
  }

  private buildOpacitySection(settings: BitigSettings): HTMLElement {
    const section = this.buildSection('Opacity');

    const { row } = this.buildSlider({
      min: 0.3,
      max: 1,
      step: 0.01,
      value: settings.appearance.opacity,
      formatValue: (v) => `${Math.round(v * 100)}%`,
      onInput: (value) => this.appearance.previewOpacity(value),
      onCommit: (value) => window.bitig.settings.set({ appearance: { opacity: value } })
    });

    section.appendChild(row);
    return section;
  }

  private buildBackgroundImageSection(settings: BitigSettings): HTMLElement {
    const section = this.buildSection('Background Image');
    const { backgroundImage, backgroundImageOpacity, backgroundImageFit } = settings.appearance;

    const pathRow = document.createElement('div');
    pathRow.className = 'settings-row settings-path-row';

    const pathLabel = document.createElement('span');
    pathLabel.className = 'settings-path-label';
    pathLabel.textContent = backgroundImage ?? 'Not selected';
    pathLabel.title = backgroundImage ?? '';

    const browseBtn = document.createElement('button');
    browseBtn.className = 'settings-btn-secondary';
    browseBtn.textContent = 'Browse...';
    browseBtn.addEventListener('click', () => void this.browseBackgroundImage());

    const clearBtn = document.createElement('button');
    clearBtn.className = 'settings-btn-secondary';
    clearBtn.textContent = 'Clear';
    clearBtn.disabled = !backgroundImage;
    clearBtn.addEventListener('click', () => {
      window.bitig.settings.set({ appearance: { backgroundImage: null } });
    });

    pathRow.append(pathLabel, browseBtn, clearBtn);
    section.appendChild(pathRow);

    const { row: opacityRow } = this.buildSlider({
      min: 0,
      max: 1,
      step: 0.01,
      value: backgroundImageOpacity,
      formatValue: (v) => `${Math.round(v * 100)}%`,
      onInput: (value) => this.appearance.previewBackgroundImageStyle(value, backgroundImageFit),
      onCommit: (value) => window.bitig.settings.set({ appearance: { backgroundImageOpacity: value } })
    });
    section.appendChild(opacityRow);

    const fitRow = document.createElement('div');
    fitRow.className = 'settings-row';
    const fitLabel = document.createElement('label');
    fitLabel.textContent = 'Fit';
    const fitSelect = document.createElement('select');
    fitSelect.className = 'settings-select';
    for (const [value, label] of Object.entries(FIT_LABELS)) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      option.selected = value === backgroundImageFit;
      fitSelect.appendChild(option);
    }
    fitSelect.addEventListener('change', () => {
      const fit = fitSelect.value as BackgroundImageFit;
      window.bitig.settings.set({ appearance: { backgroundImageFit: fit } });
    });
    fitRow.append(fitLabel, fitSelect);
    section.appendChild(fitRow);

    return section;
  }

  private buildResetSection(): HTMLElement {
    const section = document.createElement('div');
    section.className = 'settings-section settings-reset-section';

    const resetBtn = document.createElement('button');
    resetBtn.className = 'settings-btn-secondary';
    resetBtn.textContent = 'Reset to Defaults';
    resetBtn.addEventListener('click', () => window.bitig.settings.reset());

    section.appendChild(resetBtn);
    return section;
  }

  private buildSection(title: string): HTMLElement {
    const section = document.createElement('div');
    section.className = 'settings-section';
    const heading = document.createElement('h3');
    heading.textContent = title;
    section.appendChild(heading);
    return section;
  }

  /**
   * A min/max slider plus a live value label. `onInput` fires on every
   * drag frame (for live preview), `onCommit` only once the drag ends
   * (to persist) - so dragging a slider doesn't write settings.json on
   * every frame.
   */
  private buildSlider(options: {
    min: number;
    max: number;
    step: number;
    value: number;
    formatValue: (value: number) => string;
    onInput: (value: number) => void;
    onCommit: (value: number) => void;
  }): { row: HTMLElement } {
    const row = document.createElement('div');
    row.className = 'settings-row settings-slider-row';

    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(options.min);
    input.max = String(options.max);
    input.step = String(options.step);
    input.value = String(options.value);
    input.className = 'settings-slider';

    const valueLabel = document.createElement('span');
    valueLabel.className = 'settings-slider-value';
    valueLabel.textContent = options.formatValue(options.value);

    input.addEventListener('input', () => {
      const value = Number(input.value);
      valueLabel.textContent = options.formatValue(value);
      options.onInput(value);
    });
    input.addEventListener('change', () => {
      options.onCommit(Number(input.value));
    });

    row.append(input, valueLabel);
    return { row };
  }

  private buildTelemetrySection(settings: BitigSettings): HTMLElement {
    const section = this.buildSection('Notifications & Task Telemetry');

    const desc = document.createElement('p');
    desc.className = 'settings-desc';
    desc.textContent =
      'Get a Windows desktop notification when a long-running command (build, test, etc.) finishes while Bitig is in the background.';

    const enableRow = document.createElement('div');
    enableRow.className = 'settings-row';

    const enableLabel = document.createElement('label');
    enableLabel.className = 'settings-checkbox-label';
    const enableCheckbox = document.createElement('input');
    enableCheckbox.type = 'checkbox';
    enableCheckbox.checked = settings.telemetry?.enableNotifications ?? true;
    enableCheckbox.addEventListener('change', () => {
      window.bitig.settings.set({
        telemetry: { enableNotifications: enableCheckbox.checked }
      });
    });
    enableLabel.append(enableCheckbox, document.createTextNode(' Enable notifications for long-running tasks'));
    enableRow.appendChild(enableLabel);

    const thresholdRow = document.createElement('div');
    thresholdRow.className = 'settings-row';

    const thresholdLabel = document.createElement('label');
    thresholdLabel.className = 'settings-label';
    thresholdLabel.textContent = 'Notification Threshold:';

    const thresholdSelect = document.createElement('select');
    thresholdSelect.className = 'settings-select';

    const thresholds = [
      { ms: 3000, label: '3 seconds' },
      { ms: 5000, label: '5 seconds (Default)' },
      { ms: 10000, label: '10 seconds' },
      { ms: 30000, label: '30 seconds' },
      { ms: 60000, label: '1 minute' }
    ];

    const currentThreshold = settings.telemetry?.notificationThresholdMs ?? 5000;
    for (const t of thresholds) {
      const opt = document.createElement('option');
      opt.value = String(t.ms);
      opt.textContent = t.label;
      if (t.ms === currentThreshold) opt.selected = true;
      thresholdSelect.appendChild(opt);
    }

    thresholdSelect.addEventListener('change', () => {
      window.bitig.settings.set({
        telemetry: { notificationThresholdMs: Number(thresholdSelect.value) }
      });
    });

    thresholdRow.append(thresholdLabel, thresholdSelect);
    section.append(desc, enableRow, thresholdRow);
    return section;
  }

  private buildCockpitSection(settings: BitigSettings): HTMLElement {
    const section = this.buildSection('Developer Cockpit');

    const desc = document.createElement('p');
    desc.className = 'settings-desc';
    desc.textContent =
      'Catch live server ports in the tab title, open file/line links in your editor, and block accidental secret-key leaks.';

    // 1. Live Port Sniffer
    const portRow = document.createElement('div');
    portRow.className = 'settings-row';
    const portLabel = document.createElement('label');
    portLabel.className = 'settings-checkbox-label';
    const portCheckbox = document.createElement('input');
    portCheckbox.type = 'checkbox';
    portCheckbox.checked = settings.cockpit?.enablePortSniffer ?? true;
    portCheckbox.addEventListener('change', () => {
      window.bitig.settings.set({
        cockpit: { enablePortSniffer: portCheckbox.checked }
      });
    });
    portLabel.append(portCheckbox, document.createTextNode(' Live Port Sniffer'));
    portRow.appendChild(portLabel);

    // 2. Secret Shield
    const shieldRow = document.createElement('div');
    shieldRow.className = 'settings-row';
    const shieldLabel = document.createElement('label');
    shieldLabel.className = 'settings-checkbox-label';
    const shieldCheckbox = document.createElement('input');
    shieldCheckbox.type = 'checkbox';
    shieldCheckbox.checked = settings.cockpit?.enableSecretShield ?? true;
    shieldCheckbox.addEventListener('change', () => {
      window.bitig.settings.set({
        cockpit: { enableSecretShield: shieldCheckbox.checked }
      });
    });
    shieldLabel.append(shieldCheckbox, document.createTextNode(' Secret Shield (Token Masking)'));
    shieldRow.appendChild(shieldLabel);

    // 3. Open in Editor
    const editorRow = document.createElement('div');
    editorRow.className = 'settings-row';
    const editorLabel = document.createElement('label');
    editorLabel.className = 'settings-checkbox-label';
    const editorCheckbox = document.createElement('input');
    editorCheckbox.type = 'checkbox';
    editorCheckbox.checked = settings.cockpit?.openLinksInEditor ?? true;
    editorCheckbox.addEventListener('change', () => {
      window.bitig.settings.set({
        cockpit: { openLinksInEditor: editorCheckbox.checked }
      });
    });
    editorLabel.append(editorCheckbox, document.createTextNode(' Open File/Line Links in Code Editor'));
    editorRow.appendChild(editorLabel);

    section.append(desc, portRow, shieldRow, editorRow);
    return section;
  }

  private buildBilgeAiSection(settings: BitigSettings): HTMLElement {
    const section = this.buildSection('Bitig Bilge (AI Assistant - Ctrl+I)');

    const desc = document.createElement('p');
    desc.className = 'settings-desc';
    desc.textContent =
      'Configure a local model (Ollama) or your own API key (OpenAI, Claude, Gemini, DeepSeek) for natural-language command generation and error analysis.';

    const ai = settings.ai || DEFAULT_AI_SETTINGS;

    // 1. Enable
    const enableRow = document.createElement('div');
    enableRow.className = 'settings-row';
    const enableLabel = document.createElement('label');
    enableLabel.className = 'settings-checkbox-label';
    const enableCheckbox = document.createElement('input');
    enableCheckbox.type = 'checkbox';
    enableCheckbox.checked = ai.enabled;
    enableCheckbox.addEventListener('change', () => {
      window.bitig.settings.set({ ai: { enabled: enableCheckbox.checked } });
    });
    enableLabel.append(enableCheckbox, document.createTextNode(' Enable Bitig Bilge AI assistant'));
    enableRow.appendChild(enableLabel);

    // 2. Provider selection
    const providerRow = document.createElement('div');
    providerRow.className = 'settings-row';
    const providerLabel = document.createElement('label');
    providerLabel.className = 'settings-label';
    providerLabel.textContent = 'AI Provider:';

    const providerSelect = document.createElement('select');
    providerSelect.className = 'settings-select';

    const providers: { id: AiProviderType; name: string }[] = [
      { id: 'ollama', name: 'Ollama (100% Local / Private)' },
      { id: 'openai', name: 'OpenAI (GPT-4o / GPT-4o-mini)' },
      { id: 'anthropic', name: 'Anthropic (Claude 3.5 Haiku / Sonnet)' },
      { id: 'gemini', name: 'Google Gemini (Gemini 1.5 Flash)' },
      { id: 'deepseek', name: 'DeepSeek (DeepSeek Coder / Chat)' },
      { id: 'custom', name: 'Custom (OpenAI-Compatible Server)' }
    ];

    for (const p of providers) {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      if (p.id === ai.provider) opt.selected = true;
      providerSelect.appendChild(opt);
    }

    providerSelect.addEventListener('change', () => {
      const provider = providerSelect.value as AiProviderType;
      let defaultEndpoint = ai.endpoint;
      let defaultModel = ai.model;

      if (provider === 'ollama') {
        defaultEndpoint = 'http://localhost:11434';
        defaultModel = 'llama3.2';
      } else if (provider === 'openai') {
        defaultEndpoint = 'https://api.openai.com/v1';
        defaultModel = 'gpt-4o-mini';
      } else if (provider === 'anthropic') {
        defaultEndpoint = 'https://api.anthropic.com/v1';
        defaultModel = 'claude-3-5-haiku-20241022';
      } else if (provider === 'gemini') {
        defaultEndpoint = 'https://generativelanguage.googleapis.com/v1beta';
        defaultModel = 'gemini-1.5-flash';
      } else if (provider === 'deepseek') {
        defaultEndpoint = 'https://api.deepseek.com/v1';
        defaultModel = 'deepseek-chat';
      }

      window.bitig.settings.set({
        ai: { provider, endpoint: defaultEndpoint, model: defaultModel }
      });
    });

    providerRow.append(providerLabel, providerSelect);

    // 3. Endpoint
    const endpointRow = document.createElement('div');
    endpointRow.className = 'settings-row';
    const endpointLabel = document.createElement('label');
    endpointLabel.className = 'settings-label';
    endpointLabel.textContent = 'API Endpoint URL:';
    const endpointInput = document.createElement('input');
    endpointInput.type = 'text';
    endpointInput.className = 'settings-input';
    endpointInput.value = ai.endpoint;
    endpointInput.placeholder = 'http://localhost:11434 or https://api.openai.com/v1';
    endpointInput.addEventListener('change', () => {
      window.bitig.settings.set({ ai: { endpoint: endpointInput.value.trim() } });
    });
    endpointRow.append(endpointLabel, endpointInput);

    // 4. API Key (BYOK)
    const keyRow = document.createElement('div');
    keyRow.className = 'settings-row';
    const keyLabel = document.createElement('label');
    keyLabel.className = 'settings-label';
    keyLabel.textContent = 'API Key (BYOK):';
    const keyInput = document.createElement('input');
    keyInput.type = 'password';
    keyInput.className = 'settings-input';
    keyInput.value = ai.apiKey;
    keyInput.placeholder = ai.provider === 'ollama' ? 'No API key required for Ollama' : 'sk-...';
    keyInput.disabled = ai.provider === 'ollama';
    keyInput.addEventListener('change', () => {
      window.bitig.settings.set({ ai: { apiKey: keyInput.value.trim() } });
    });
    keyRow.append(keyLabel, keyInput);
    const keyHint = document.createElement('p');
    keyHint.className = 'settings-desc settings-hint-tight';
    keyHint.textContent = 'Stored encrypted on disk via Windows (safeStorage/DPAPI), never as plaintext.';

    // 5. Model name
    const modelRow = document.createElement('div');
    modelRow.className = 'settings-row';
    const modelLabel = document.createElement('label');
    modelLabel.className = 'settings-label';
    modelLabel.textContent = 'Model Name:';
    const modelInput = document.createElement('input');
    modelInput.type = 'text';
    modelInput.className = 'settings-input';
    modelInput.value = ai.model;
    modelInput.placeholder = 'llama3.2, gpt-4o-mini, gemini-1.5-flash...';
    modelInput.addEventListener('change', () => {
      window.bitig.settings.set({ ai: { model: modelInput.value.trim() } });
    });
    modelRow.append(modelLabel, modelInput);

    // 6. Temperature
    const { row: temperatureRow } = this.buildSlider({
      min: 0,
      max: 1,
      step: 0.05,
      value: ai.temperature ?? DEFAULT_AI_SETTINGS.temperature,
      formatValue: (v) => v.toFixed(2),
      onInput: () => undefined,
      onCommit: (value) => window.bitig.settings.set({ ai: { temperature: value } })
    });
    const temperatureLabel = document.createElement('label');
    temperatureLabel.textContent = 'Temperature:';
    temperatureRow.prepend(temperatureLabel);

    // 7. Test button
    const testRow = document.createElement('div');
    testRow.className = 'settings-row';
    const testBtn = document.createElement('button');
    testBtn.type = 'button';
    testBtn.className = 'settings-btn-secondary';
    testBtn.innerHTML = icon('zap') + '<span>Test Connection</span>';

    const testResult = document.createElement('span');
    testResult.className = 'ai-test-result';

    testBtn.addEventListener('click', async () => {
      testBtn.disabled = true;
      testResult.textContent = 'Testing...';
      testResult.className = 'ai-test-result loading';
      try {
        const res = await window.bitig.ai.testConnection();
        testBtn.disabled = false;
        testResult.textContent = res.message;
        testResult.className = `ai-test-result ${res.success ? 'success' : 'error'}`;
      } catch (err) {
        testBtn.disabled = false;
        testResult.textContent = `Error: ${(err as Error).message}`;
        testResult.className = 'ai-test-result error';
      }
    });

    testRow.append(testBtn, testResult);

    section.append(desc, enableRow, providerRow, endpointRow, keyRow, keyHint, modelRow, temperatureRow, testRow);
    return section;
  }

  private async browseBackgroundImage(): Promise<void> {
    const picked = await window.bitig.settings.pickBackgroundImage();
    if (picked) {
      window.bitig.settings.set({ appearance: { backgroundImage: picked } });
    }
  }
}
