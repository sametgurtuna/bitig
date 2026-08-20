import {
  ACTION_DEFINITIONS,
  DEFAULT_KEYBINDINGS,
  normalizeKeyCombo,
  type ActionDefinition,
  type ActionId
} from '../../shared/actionTypes';

/**
 * Tum klavye kisayollarini tek bir merkezden cozen ve eylemlere yonlendiren yonetici.
 * xterm.js ile isletim sistemi/uygulama kisayollari arasindaki cakismalari onler.
 */
export class KeybindingManager {
  private bindings: Record<string, string> = { ...DEFAULT_KEYBINDINGS };
  private readonly handlers = new Map<ActionId, () => void | Promise<void>>();

  constructor() {
    window.addEventListener('keydown', (event) => this.handleKeydown(event));
    // Tab ile DOM odak gezintisi bir terminal uygulamasinda istenmez: odak
    // sessizce title bar / durum cubugu butonlarina kayiyor ve sonraki Enter
    // (or. yayin modu butonu) yanlislikla tetikleniyordu. Yalniz gercek metin
    // alanlarinda (modal girdileri, ayarlar formu) varsayilan davranis korunur.
    window.addEventListener(
      'keydown',
      (event) => {
        if (event.key !== 'Tab' || event.defaultPrevented) return;
        if (isTextEntry(event.target)) return;
        event.preventDefault();
      },
      true
    );
  }

  setBindings(customBindings?: Record<string, string>): void {
    this.bindings = { ...DEFAULT_KEYBINDINGS, ...(customBindings || {}) };
  }

  getBindings(): Record<string, string> {
    return { ...this.bindings };
  }

  getBinding(actionId: ActionId): string {
    return this.bindings[actionId] || DEFAULT_KEYBINDINGS[actionId] || '';
  }

  registerAction(actionId: ActionId, handler: () => void | Promise<void>): void {
    this.handlers.set(actionId, handler);
  }

  /**
   * Belirtilen tus kombinasyonunun baska bir eylem tarafindan kullanilip
   * kullanilmadigini kontrol eder.
   */
  findConflict(actionId: ActionId, keyCombo: string): ActionDefinition | null {
    if (!keyCombo) return null;
    const normalizedTarget = keyCombo.toLowerCase();

    for (const def of ACTION_DEFINITIONS) {
      if (def.id === actionId) continue;
      const current = (this.bindings[def.id] || def.defaultKeys || '').toLowerCase();
      if (current === normalizedTarget) {
        return def;
      }
    }
    return null;
  }

  /**
   * xterm.attachCustomKeyEventHandler icin:
   * Eger tus kombinasyonu Bitig'in kayitli bir kisayoluysa true doner
   * ve terminalin bu tusu duz metin olarak yutmasini onler.
   */
  isReserved(event: KeyboardEvent): boolean {
    if (event.type !== 'keydown') return false;
    const combo = normalizeKeyCombo(event);
    if (!combo) return false;

    const normalizedCombo = combo.toLowerCase();
    for (const key of Object.values(this.bindings)) {
      if (key.toLowerCase() === normalizedCombo) {
        return true;
      }
    }
    return false;
  }

  private handleKeydown(event: KeyboardEvent): void {
    const combo = normalizeKeyCombo(event);
    if (!combo) return;

    const normalizedCombo = combo.toLowerCase();

    // Hangi actionId bu kombinasyona atanmis bul
    for (const [actionId, keyCombo] of Object.entries(this.bindings)) {
      if (keyCombo.toLowerCase() === normalizedCombo) {
        const handler = this.handlers.get(actionId as ActionId);
        if (handler) {
          event.preventDefault();
          void handler();
          return;
        }
      }
    }
  }
}

/** Tab'in dogal davranisini koruyacak gercek metin girdisi mi? */
function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}
