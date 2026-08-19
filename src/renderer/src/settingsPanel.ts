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
import type { KeybindingManager } from './keybindings';

const FIT_LABELS: Record<BackgroundImageFit, string> = {
  cover: 'Kapla (cover)',
  contain: 'Sigdir (contain)',
  center: 'Ortala (center)',
  tile: 'Dosele (tile)'
};

/** Onizlemede gosterilen ornek Nerd Font ikonlari (Powerline + Devicons). */
const NERD_FONT_SAMPLE_ICONS = '\uE0B0  \uE706  \uF09B  \uF07B  \uE62B  \uF120';

/**
 * Windows Terminal'deki ayarlar sekmesine benzer bir ayarlar paneli:
 * title bar'daki disli butonuyla acilir, #terminal-shell'in yerini
 * kaplar. Gorunum, Kabuk Profilleri, Font ve Klavye Kisayollari bolumlerini icerir.
 */
export class SettingsPanel {
  private isOpen = false;
  // Font listesi PowerShell spawn'i + yuzlerce canvas olcumu gerektiriyor;
  // panel her acildiginda degil, ilk acilista bir kez yuklenir.
  private fonts: FontInfo[] | null = null;
  private fontsLoading = false;
  private recordingActionId: ActionId | null = null;

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

  /** Font listesini bir kez yukler; bittiginde paneli yeniden cizer. */
  private async ensureFontsLoaded(): Promise<void> {
    if (this.fonts || this.fontsLoading) return;
    this.fontsLoading = true;
    try {
      const selected = this.appearance.getState()?.settings.terminal.fontFamily;
      this.fonts = await loadUsableFonts(selected);
    } catch (error) {
      console.error(`[Bitig] Font listesi yuklenemedi: ${String(error)}`);
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
    // Eger su anda bir kisayol tusu kaydediliyorsa
    if (this.recordingActionId) {
      event.preventDefault();
      event.stopPropagation();

      // Sadece Escape tusu basilmissa kayittan vazgec
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

    this.panelEl.replaceChildren(
      this.buildHeader(),
      this.buildProfileSection(settings),
      this.buildKeybindingsSection(settings),
      this.buildCockpitSection(settings),
      this.buildTelemetrySection(settings),
      this.buildThemeSection(themes, settings),
      this.buildFontSection(settings),
      this.buildOpacitySection(settings),
      this.buildBackgroundImageSection(settings),
      this.buildResetSection()
    );
  }

  private buildHeader(): HTMLElement {
    const header = document.createElement('div');
    header.className = 'settings-header';

    const title = document.createElement('h2');
    title.textContent = 'Ayarlar';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'settings-close-btn';
    closeBtn.title = 'Kapat (Esc)';
    closeBtn.setAttribute('aria-label', 'Ayarlari kapat');
    closeBtn.innerHTML = '<svg viewBox="0 0 10 10"><path d="M0 0l10 10M10 0L0 10" /></svg>';
    closeBtn.addEventListener('click', () => this.close());

    header.append(title, closeBtn);
    return header;
  }

  private buildProfileSection(settings: BitigSettings): HTMLElement {
    const section = this.buildSection('Kabuk Profilleri');

    const desc = document.createElement('p');
    desc.className = 'settings-desc';
    desc.textContent = 'Yeni sekmelerde ve pencerelerde baslatilacak varsayilan kabugu belirleyin:';

    const row = document.createElement('div');
    row.className = 'settings-row';

    const label = document.createElement('label');
    label.className = 'settings-label';
    label.textContent = 'Varsayilan Profil';
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

  private buildKeybindingsSection(settings: BitigSettings): HTMLElement {
    const section = this.buildSection('Klavye Kisayollari');

    const desc = document.createElement('p');
    desc.className = 'settings-desc';
    desc.textContent =
      'Terminal eylemleri icin klavye kisayollarini ozellestirin. Bir kisayola tiklayip yeni tus kombinasyonuna basarak aninda degistirebilirsiniz.';

    section.appendChild(desc);

    const categories: ActionCategory[] = ['Sekmeler', 'Paneller', 'Gorunum ve Arama', 'Uygulama'];

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
          conflictBadge.title = `Bu tus baska bir eylemle cakismakta: ${conflict.name}`;
          conflictBadge.textContent = `⚠ Cakisiyor: ${conflict.name}`;
          controls.appendChild(conflictBadge);
        }

        const keyBtn = document.createElement('button');
        keyBtn.type = 'button';
        keyBtn.className = `keybinding-btn ${isRecording ? 'recording' : ''}`;
        keyBtn.title = isRecording ? 'Iptal icin Esc tusuna basin' : 'Degistirmek icin tiklayin';

        if (isRecording) {
          keyBtn.innerHTML = '<span class="recording-pulse"></span> Tus bekleniyor...';
        } else {
          keyBtn.textContent = currentKey;
        }

        keyBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.recordingActionId = isRecording ? null : def.id;
          this.render();
        });

        controls.appendChild(keyBtn);

        // Varsayilana don butonu
        if (currentKey !== def.defaultKeys) {
          const resetBtn = document.createElement('button');
          resetBtn.type = 'button';
          resetBtn.className = 'keybinding-reset-btn';
          resetBtn.title = `Varsayilana don (${def.defaultKeys})`;
          resetBtn.innerHTML = '↺';
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
    const section = this.buildSection('Tema');

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
    familyLabel.textContent = 'Aile';

    if (!this.fonts) {
      const loading = document.createElement('span');
      loading.className = 'settings-path-label';
      loading.textContent = 'Fontlar yukleniyor...';
      familyRow.append(familyLabel, loading);
      section.appendChild(familyRow);
      return section;
    }

    const select = document.createElement('select');
    select.className = 'settings-select';
    if (this.fonts.length === 0) {
      const option = document.createElement('option');
      option.textContent = 'Font bulunamadi';
      select.appendChild(option);
      select.disabled = true;
    }
    for (const font of this.fonts) {
      const option = document.createElement('option');
      option.value = font.family;
      // Nerd Font olanlari listede de isaretle: kullanici acmadan once
      // hangi secenegin ikon destekledigini gorebilsin.
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
      // Font boyutu, opaklik gibi ucuz bir CSS degisikligi degil - her
      // adimda tum terminalleri yeniden olcup PTY'ye resize gonderirdi.
      // Bu yuzden anlik onizleme yok, sadece surukleme bitince uygulanir.
      onInput: () => undefined,
      onCommit: (value) => window.bitig.settings.set({ terminal: { fontSize: value } })
    });
    const sizeLabel = document.createElement('label');
    sizeLabel.textContent = 'Boyut';
    sizeRow.prepend(sizeLabel);
    section.appendChild(sizeRow);

    section.appendChild(this.buildFontPreview(fontFamily, fontSize));
    return section;
  }

  /**
   * Canli onizleme: secili fontla ornek metin + yaygin Nerd Font ikonlari.
   * Ikonlar tofu kutusu olarak cikiyorsa kullanici bunu ayarlar
   * ekranindayken gorur - bozuk bir prompt'ta kesfetmesi gerekmez.
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
        'Bu font Nerd Font ikonlari icermiyor; yukaridaki ikon satiri bos kutular olarak gorunecek. Ikonlu bir prompt kullaniyorsan ';
      const link = document.createElement('a');
      link.href = 'https://www.nerdfonts.com/';
      link.textContent = 'nerdfonts.com';
      // target="_blank" olmadan tiklama renderer'i uygulamadan disari
      // yonlendirirdi; boylece main'deki setWindowOpenHandler devreye
      // girip linki varsayilan tarayicida aciyor (bkz. main/index.ts).
      link.target = '_blank';
      link.rel = 'noreferrer';
      notice.append(link, document.createTextNode(" adresinden ikonlu bir surum kurabilirsin."));
      preview.appendChild(notice);
    }

    return preview;
  }

  private buildOpacitySection(settings: BitigSettings): HTMLElement {
    const section = this.buildSection('Opaklik');

    const { row } = this.buildSlider({
      min: 0.3,
      max: 1,
      step: 0.01,
      value: settings.appearance.opacity,
      formatValue: (v) => `%${Math.round(v * 100)}`,
      onInput: (value) => this.appearance.previewOpacity(value),
      onCommit: (value) => window.bitig.settings.set({ appearance: { opacity: value } })
    });

    section.appendChild(row);
    return section;
  }

  private buildBackgroundImageSection(settings: BitigSettings): HTMLElement {
    const section = this.buildSection('Arkaplan Gorseli');
    const { backgroundImage, backgroundImageOpacity, backgroundImageFit } = settings.appearance;

    const pathRow = document.createElement('div');
    pathRow.className = 'settings-row settings-path-row';

    const pathLabel = document.createElement('span');
    pathLabel.className = 'settings-path-label';
    pathLabel.textContent = backgroundImage ?? 'Secilmedi';
    pathLabel.title = backgroundImage ?? '';

    const browseBtn = document.createElement('button');
    browseBtn.className = 'settings-btn-secondary';
    browseBtn.textContent = 'Gozat...';
    browseBtn.addEventListener('click', () => void this.browseBackgroundImage());

    const clearBtn = document.createElement('button');
    clearBtn.className = 'settings-btn-secondary';
    clearBtn.textContent = 'Temizle';
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
      formatValue: (v) => `%${Math.round(v * 100)}`,
      onInput: (value) => this.appearance.previewBackgroundImageStyle(value, backgroundImageFit),
      onCommit: (value) => window.bitig.settings.set({ appearance: { backgroundImageOpacity: value } })
    });
    section.appendChild(opacityRow);

    const fitRow = document.createElement('div');
    fitRow.className = 'settings-row';
    const fitLabel = document.createElement('label');
    fitLabel.textContent = 'Yerlesim';
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
    resetBtn.textContent = 'Varsayilanlara don';
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
   * min/max slider + canli deger etiketi. `onInput` her surukleme
   * frame'inde (anlik onizleme icin), `onCommit` sadece surukleme
   * bittiginde (diske yazmak icin) cagrilir - boylece bir slider
   * surukleme her frame'de settings.json'a yazmiyor.
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
    const section = this.buildSection('Bildirimler ve Gorev Telemetrisi');

    const desc = document.createElement('p');
    desc.className = 'settings-desc';
    desc.textContent =
      'Uzun suren komutlar (derleme, test vb.) tamamlandiginda ve Bitig arka plandayken Windows masaustu bildirimi alin.';

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
    enableLabel.append(enableCheckbox, document.createTextNode(' Uzun suren gorev bildirimlerini etkinlestir'));
    enableRow.appendChild(enableLabel);

    const thresholdRow = document.createElement('div');
    thresholdRow.className = 'settings-row';

    const thresholdLabel = document.createElement('label');
    thresholdLabel.className = 'settings-label';
    thresholdLabel.textContent = 'Bildirim Esik Suresi:';

    const thresholdSelect = document.createElement('select');
    thresholdSelect.className = 'settings-select';

    const thresholds = [
      { ms: 3000, label: '3 saniye' },
      { ms: 5000, label: '5 saniye (Varsayilan)' },
      { ms: 10000, label: '10 saniye' },
      { ms: 30000, label: '30 saniye' },
      { ms: 60000, label: '1 dakika' }
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
    const section = this.buildSection('Gelistirici Kokpiti (Developer Cockpit)');

    const desc = document.createElement('p');
    desc.className = 'settings-desc';
    desc.textContent =
      'Canli sunucu portlarini sekme basliginda yakalayin, dosya/satir baglantilarini editorde acin ve gizli anahtar sizintilarini engelleyin.';

    // 1. Canli Port Dinleyicisi
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
    portLabel.append(portCheckbox, document.createTextNode(' Canli Port Dinleyicisi (Live Port Sniffer)'));
    portRow.appendChild(portLabel);

    // 2. Gizli Anahtar Kalkani
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
    shieldLabel.append(shieldCheckbox, document.createTextNode(' Gizli Anahtar Kalkani (Secret Shield Token Masking)'));
    shieldRow.appendChild(shieldLabel);

    // 3. Editorde Ac
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
    editorLabel.append(editorCheckbox, document.createTextNode(' Dosya/Satir Baglantilarini Kod Editorunde Ac'));
    editorRow.appendChild(editorLabel);

    section.append(desc, portRow, shieldRow, editorRow);
    return section;
  }

  private async browseBackgroundImage(): Promise<void> {
    const picked = await window.bitig.settings.pickBackgroundImage();
    if (picked) {
      window.bitig.settings.set({ appearance: { backgroundImage: picked } });
    }
  }
}
