import type { PluginContributions, PluginActionContribution } from '../../shared/pluginTypes';
import type { StatusBar } from './statusBar';
import type { KeybindingManager } from './keybindings';
import type { ActionId } from '../../shared/actionTypes';

/**
 * Renderer tarafinda calisan Eklenti Calisma Zamani (Plugin Runtime).
 * Main surecinden yayinlanan eklenti widget'larini ve eylemlerini dinler,
 * StatusBar ve KeybindingManager'a dinamik olarak kaydeder.
 */
export class PluginRuntime {
  private registeredActionIds = new Set<string>();
  private currentActions: PluginActionContribution[] = [];

  constructor(
    private readonly statusBar: StatusBar,
    private readonly keybindings: KeybindingManager
  ) {
    // 1. Canli guncellemeleri dinle
    window.bitig.plugins.onContributions((contributions: PluginContributions) => {
      this.applyContributions(contributions);
    });

    // 2. Baslangicta mevcut katkilari hemen talep et
    void this.fetchInitialContributions();
  }

  private async fetchInitialContributions(): Promise<void> {
    try {
      const contributions = await window.bitig.plugins.getContributions();
      this.applyContributions(contributions);
    } catch (err) {
      console.error('[PluginRuntime] Baslangic katkilari alinamadi:', err);
    }
  }

  private applyContributions(contributions: PluginContributions): void {
    if (!contributions) return;

    // 1. Status Bar Widget'larini guncelle
    this.statusBar.updatePluginWidgets(contributions.widgets || []);

    // 2. Dinamik Eylemleri (Actions) kaydet
    this.currentActions = contributions.actions || [];
    for (const action of this.currentActions) {
      if (!this.registeredActionIds.has(action.actionId)) {
        this.registeredActionIds.add(action.actionId);
        this.keybindings.registerAction(action.actionId as ActionId, () => {
          window.bitig.plugins.executeAction(action.actionId);
        });
      }
    }
  }

  getActions(): PluginActionContribution[] {
    return this.currentActions;
  }
}
