import '@xterm/xterm/css/xterm.css';
import { initTitleBar } from './titlebar';
import { TabStore } from './tabs';
import { AppearanceController } from './appearance';

/**
 * Uygulama girisi: title bar davranisini baglar, gorunum (tema/opaklik/
 * arkaplan) kontrolcusunu ve sekme yonetimini (TabStore) baslatir.
 */
async function bootstrap(): Promise<void> {
  initTitleBar();

  const rootEl = document.getElementById('terminal-root');
  const tabbarListEl = document.getElementById('tabbar-list');
  const newTabBtn = document.getElementById('new-tab-btn');
  if (!rootEl || !tabbarListEl || !newTabBtn) {
    throw new Error('Sekme icin gerekli DOM elemanlari bulunamadi');
  }

  const appearance = new AppearanceController();
  const tabStore = new TabStore(rootEl, tabbarListEl, () => appearance.cycleTheme());

  // Ilk sekme acilmadan once aktif tema/opaklik/arkaplan uygulanmis olsun;
  // TabStore.createTab() zaten guncel temayla (currentTerminalTheme) acar.
  await appearance.init(tabStore);

  newTabBtn.addEventListener('click', () => void tabStore.createTab());
  window.addEventListener('beforeunload', () => tabStore.disposeAll());

  void tabStore.createTab();
}

void bootstrap();
