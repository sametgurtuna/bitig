import type { BitigSnippet, SnippetVariable } from '../../shared/snippetTypes';
import { fuzzyScore } from './fuzzy';
import type { TabStore } from './tabs';

type ModalView = 'list' | 'form' | 'editor';

/**
 * "Bitig Betik" — Parametrik Runbook / Snippet Yoneticisi (Ctrl+Shift+B)
 * Karmaşık CLI komutlarini sablonlar halinde saklar, degiskenler icin gorsel form uretir
 * ve canli onizleme ile aktif terminal oturumuna gonderir.
 */
export class BetikModal {
  private isOpen = false;
  private currentView: ModalView = 'list';
  private snippets: BitigSnippet[] = [];
  private filteredSnippets: BitigSnippet[] = [];
  private selectedSnippet: BitigSnippet | null = null;
  private formValues: Record<string, string> = {};
  private activeCategory: string = 'All';

  private readonly backdropEl: HTMLDivElement;
  private readonly modalEl: HTMLDivElement;
  private readonly contentEl: HTMLDivElement;

  constructor(
    private readonly rootEl: HTMLElement,
    private readonly tabStore: TabStore
  ) {
    this.backdropEl = document.createElement('div');
    this.backdropEl.className = 'betik-backdrop hidden';

    this.modalEl = document.createElement('div');
    this.modalEl.className = 'betik-modal';

    this.contentEl = document.createElement('div');
    this.contentEl.className = 'betik-content';

    this.modalEl.appendChild(this.contentEl);
    this.backdropEl.appendChild(this.modalEl);
    this.rootEl.appendChild(this.backdropEl);

    this.backdropEl.addEventListener('click', (e) => {
      if (e.target === this.backdropEl) this.close();
    });

    document.addEventListener('keydown', (e) => {
      if (!this.isOpen) return;
      if (e.key === 'Escape') {
        if (this.currentView === 'form' || this.currentView === 'editor') {
          e.preventDefault();
          this.switchView('list');
        } else {
          this.close();
        }
      }
    });
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else void this.open();
  }

  async open(): Promise<void> {
    this.isOpen = true;
    this.snippets = await window.bitig.snippets.list();
    this.filteredSnippets = [...this.snippets];
    this.activeCategory = 'All';
    this.switchView('list');

    this.backdropEl.classList.remove('hidden');
  }

  close(): void {
    this.isOpen = false;
    this.backdropEl.classList.add('hidden');
  }

  private switchView(view: ModalView): void {
    this.currentView = view;
    this.contentEl.replaceChildren();

    if (view === 'list') {
      this.renderListView();
    } else if (view === 'form' && this.selectedSnippet) {
      this.renderParametricFormView(this.selectedSnippet);
    } else if (view === 'editor') {
      this.renderEditorView();
    }
  }

  // =========================================================================
  // 1. Liste / Arama Gorunumu
  // =========================================================================

  private renderListView(): void {
    const header = document.createElement('div');
    header.className = 'betik-header';

    const titleWrap = document.createElement('div');
    titleWrap.className = 'betik-title-wrap';

    const title = document.createElement('h2');
    title.innerHTML = '📜 Bitig Betik <span class="betik-badge">Runbooks</span>';

    const desc = document.createElement('p');
    desc.className = 'betik-subtitle';
    desc.textContent = 'Run long CLI commands reliably using parametric command templates.';

    titleWrap.append(title, desc);

    const newBtn = document.createElement('button');
    newBtn.className = 'betik-btn-primary';
    newBtn.innerHTML = '+ New Betik';
    newBtn.addEventListener('click', () => this.switchView('editor'));

    header.append(titleWrap, newBtn);

    // Arama ve Kategori Filtresi
    const filterBar = document.createElement('div');
    filterBar.className = 'betik-filter-bar';

    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.className = 'betik-search-input';
    searchInput.placeholder = 'Search snippets or command patterns (docker, ffmpeg, git...)...';

    const categoryList = document.createElement('div');
    categoryList.className = 'betik-cat-pills';

    const categories = ['All', 'Docker', 'Git', 'Media', 'System', 'Web & Network', 'Kubernetes'];
    for (const cat of categories) {
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = `betik-pill ${this.activeCategory === cat ? 'active' : ''}`;
      pill.textContent = cat;
      pill.addEventListener('click', () => {
        this.activeCategory = cat;
        this.filterSnippets(searchInput.value);
        this.renderSnippetGrid(grid);
        categoryList.querySelectorAll('.betik-pill').forEach((p) => p.classList.remove('active'));
        pill.classList.add('active');
      });
      categoryList.appendChild(pill);
    }

    filterBar.append(searchInput, categoryList);

    const grid = document.createElement('div');
    grid.className = 'betik-grid';
    this.renderSnippetGrid(grid);

    searchInput.addEventListener('input', () => {
      this.filterSnippets(searchInput.value);
      this.renderSnippetGrid(grid);
    });

    this.contentEl.append(header, filterBar, grid);
    setTimeout(() => searchInput.focus(), 50);
  }

  private filterSnippets(query: string): void {
    let list = this.snippets;
    if (this.activeCategory !== 'All') {
      list = list.filter((s) => s.category === this.activeCategory);
    }

    if (!query.trim()) {
      this.filteredSnippets = list;
      return;
    }

    const scored: { snippet: BitigSnippet; score: number }[] = [];
    for (const s of list) {
      const matchTarget = `${s.name} ${s.description} ${s.template} ${(s.tags || []).join(' ')}`;
      const res = fuzzyScore(query, matchTarget);
      if (res.matches) {
        scored.push({ snippet: s, score: res.score });
      }
    }
    scored.sort((a, b) => b.score - a.score);
    this.filteredSnippets = scored.map((s) => s.snippet);
  }

  private renderSnippetGrid(gridEl: HTMLElement): void {
    gridEl.replaceChildren();

    if (this.filteredSnippets.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'betik-empty';
      empty.textContent = 'No matching snippet found.';
      gridEl.appendChild(empty);
      return;
    }

    for (const snippet of this.filteredSnippets) {
      const card = document.createElement('div');
      card.className = 'betik-card';

      const cardHeader = document.createElement('div');
      cardHeader.className = 'betik-card-header';

      const cardTitle = document.createElement('h3');
      cardTitle.className = 'betik-card-title';
      cardTitle.textContent = snippet.name;

      const catBadge = document.createElement('span');
      catBadge.className = 'betik-card-cat';
      catBadge.textContent = snippet.category;

      cardHeader.append(cardTitle, catBadge);

      const cardDesc = document.createElement('p');
      cardDesc.className = 'betik-card-desc';
      cardDesc.textContent = snippet.description;

      const codePreview = document.createElement('div');
      codePreview.className = 'betik-code-snippet';
      codePreview.textContent = snippet.template;

      const cardFooter = document.createElement('div');
      cardFooter.className = 'betik-card-footer';

      const runBtn = document.createElement('button');
      runBtn.className = 'betik-btn-run';
      runBtn.textContent = '🚀 Run / Fill In';
      runBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openSnippetForm(snippet);
      });

      cardFooter.appendChild(runBtn);

      card.append(cardHeader, cardDesc, codePreview, cardFooter);
      card.addEventListener('click', () => this.openSnippetForm(snippet));

      gridEl.appendChild(card);
    }
  }

  private openSnippetForm(snippet: BitigSnippet): void {
    this.selectedSnippet = snippet;
    // Degiskenleri cikar ve varsayilan degerleri ata
    const vars = this.extractVariables(snippet);
    this.formValues = {};
    for (const v of vars) {
      this.formValues[v.name] = v.defaultValue || '';
    }
    this.switchView('form');
  }

  // =========================================================================
  // 2. Parametrik Form & Canli Onizleme Gorunumu
  // =========================================================================

  private renderParametricFormView(snippet: BitigSnippet): void {
    const header = document.createElement('div');
    header.className = 'betik-header';

    const backBtn = document.createElement('button');
    backBtn.className = 'betik-btn-back';
    backBtn.innerHTML = '← Back (Esc)';
    backBtn.addEventListener('click', () => this.switchView('list'));

    const titleWrap = document.createElement('div');
    titleWrap.className = 'betik-title-wrap';

    const title = document.createElement('h2');
    title.textContent = snippet.name;

    const desc = document.createElement('p');
    desc.className = 'betik-subtitle';
    desc.textContent = snippet.description;

    titleWrap.append(title, desc);
    header.append(backBtn, titleWrap);

    // Form Alani
    const formContainer = document.createElement('div');
    formContainer.className = 'betik-form-container';

    const variables = this.extractVariables(snippet);

    const updatePreview = (): void => {
      previewBox.textContent = this.composeCommand(snippet.template, this.formValues);
    };

    if (variables.length > 0) {
      const fieldsGrid = document.createElement('div');
      fieldsGrid.className = 'betik-fields-grid';

      variables.forEach((v, idx) => {
        const fieldGroup = document.createElement('div');
        fieldGroup.className = 'betik-field-group';

        const label = document.createElement('label');
        label.className = 'betik-field-label';
        label.textContent = v.label || v.name;

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'betik-field-input';
        input.value = this.formValues[v.name] || '';
        input.placeholder = v.defaultValue || v.name;

        input.addEventListener('input', () => {
          this.formValues[v.name] = input.value;
          updatePreview();
        });

        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && !e.ctrlKey) {
            e.preventDefault();
            this.executeSnippet(snippet);
          }
        });

        if (idx === 0) {
          setTimeout(() => input.focus(), 50);
        }

        fieldGroup.append(label, input);
        fieldsGrid.appendChild(fieldGroup);
      });

      formContainer.appendChild(fieldsGrid);
    } else {
      const noVarsMsg = document.createElement('p');
      noVarsMsg.className = 'betik-no-vars';
      noVarsMsg.textContent = 'This template has no parameters. You can run it directly.';
      formContainer.appendChild(noVarsMsg);
    }

    // Canli Komut Onizleme Kutusu
    const previewSection = document.createElement('div');
    previewSection.className = 'betik-preview-section';

    const previewLabel = document.createElement('div');
    previewLabel.className = 'betik-preview-label';
    previewLabel.textContent = 'Live Command Preview (Will Run In Terminal)';

    const previewBox = document.createElement('div');
    previewBox.className = 'betik-preview-box';
    updatePreview();

    previewSection.append(previewLabel, previewBox);

    // Eylem Butonlari
    const actionsBar = document.createElement('div');
    actionsBar.className = 'betik-actions-bar';

    const copyBtn = document.createElement('button');
    copyBtn.className = 'betik-btn-secondary';
    copyBtn.innerHTML = '📋 Copy to Clipboard';
    copyBtn.addEventListener('click', () => {
      const cmd = this.composeCommand(snippet.template, this.formValues);
      void navigator.clipboard.writeText(cmd);
      copyBtn.textContent = '✓ Copied!';
      setTimeout(() => (copyBtn.innerHTML = '📋 Copy to Clipboard'), 1500);
    });

    const runBtn = document.createElement('button');
    runBtn.className = 'betik-btn-primary';
    runBtn.innerHTML = '🚀 Send to Terminal & Run (Enter)';
    runBtn.addEventListener('click', () => {
      this.executeSnippet(snippet);
    });

    actionsBar.append(copyBtn, runBtn);

    this.contentEl.append(header, formContainer, previewSection, actionsBar);
  }

  private executeSnippet(snippet: BitigSnippet): void {
    const finalCmd = this.composeCommand(snippet.template, this.formValues);
    this.close();
    // Aktif terminale komutu ve Enter karakterini (\r) gonder
    this.tabStore.writeToActivePane(`${finalCmd}\r`);
  }

  private extractVariables(snippet: BitigSnippet): SnippetVariable[] {
    const regex = /\{\{([a-zA-Z0-9_-]+)\}\}/g;
    const foundNames: string[] = [];
    let match: RegExpExecArray | null;

    while ((match = regex.exec(snippet.template)) !== null) {
      if (!foundNames.includes(match[1])) {
        foundNames.push(match[1]);
      }
    }

    const definedVars = snippet.variables || [];
    return foundNames.map((name) => {
      const existing = definedVars.find((v) => v.name === name);
      return existing || { name, label: name, defaultValue: '' };
    });
  }

  private composeCommand(template: string, values: Record<string, string>): string {
    return template.replace(/\{\{([a-zA-Z0-9_-]+)\}\}/g, (_match, varName: string) => {
      const val = values[varName];
      return val !== undefined && val !== '' ? val : `{{${varName}}}`;
    });
  }

  // =========================================================================
  // 3. Yeni / Duzenle Betik Editoru
  // =========================================================================

  private renderEditorView(): void {
    const header = document.createElement('div');
    header.className = 'betik-header';

    const backBtn = document.createElement('button');
    backBtn.className = 'betik-btn-back';
    backBtn.innerHTML = '← Back (Esc)';
    backBtn.addEventListener('click', () => this.switchView('list'));

    const title = document.createElement('h2');
    title.textContent = 'Add New Betik Template';

    header.append(backBtn, title);

    const form = document.createElement('div');
    form.className = 'betik-editor-form';

    // Template name
    const nameGroup = this.buildInputGroup('Template Name', 'e.g. Docker PostgreSQL Container');
    // Description
    const descGroup = this.buildInputGroup('Description', 'e.g. Starts a PostgreSQL 16 database');
    // Category
    const catGroup = document.createElement('div');
    catGroup.className = 'betik-field-group';
    const catLabel = document.createElement('label');
    catLabel.className = 'betik-field-label';
    catLabel.textContent = 'Category';
    const catSelect = document.createElement('select');
    catSelect.className = 'betik-field-input';
    ['Docker', 'Git', 'Media', 'System', 'Web & Network', 'Kubernetes', 'General'].forEach((cat) => {
      const opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = cat;
      catSelect.appendChild(opt);
    });
    catGroup.append(catLabel, catSelect);

    // Command template
    const tplGroup = document.createElement('div');
    tplGroup.className = 'betik-field-group';
    const tplLabel = document.createElement('label');
    tplLabel.className = 'betik-field-label';
    tplLabel.textContent = 'Command Template (use {{name}} for variables)';
    const tplArea = document.createElement('textarea');
    tplArea.className = 'betik-field-input betik-textarea';
    tplArea.placeholder = 'e.g. docker run -d -p {{port}}:5432 -e POSTGRES_PASSWORD={{password}} postgres:16';
    tplArea.rows = 4;
    tplGroup.append(tplLabel, tplArea);

    const saveBtn = document.createElement('button');
    saveBtn.className = 'betik-btn-primary';
    saveBtn.textContent = 'Save Template';
    saveBtn.addEventListener('click', async () => {
      const name = (nameGroup.querySelector('input') as HTMLInputElement).value.trim();
      const descText = (descGroup.querySelector('input') as HTMLInputElement).value.trim();
      const template = tplArea.value.trim();
      const category = catSelect.value as any;

      if (!name || !template) {
        alert('Please enter at least a Template Name and a Command Template.');
        return;
      }

      const newSnippet: BitigSnippet = {
        id: `custom-${crypto.randomUUID().slice(0, 8)}`,
        name,
        description: descText,
        template,
        category
      };

      this.snippets = await window.bitig.snippets.save(newSnippet);
      this.filteredSnippets = [...this.snippets];
      this.switchView('list');
    });

    form.append(nameGroup, descGroup, catGroup, tplGroup, saveBtn);
    this.contentEl.append(header, form);
  }

  private buildInputGroup(label: string, placeholder: string): HTMLElement {
    const group = document.createElement('div');
    group.className = 'betik-field-group';
    const lbl = document.createElement('label');
    lbl.className = 'betik-field-label';
    lbl.textContent = label;
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.className = 'betik-field-input';
    inp.placeholder = placeholder;
    group.append(lbl, inp);
    return group;
  }
}
