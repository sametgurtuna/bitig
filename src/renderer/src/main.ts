import '@xterm/xterm/css/xterm.css';
import { initTitleBar } from './titlebar';
import { TabStore } from './tabs';

/**
 * Uygulama girisi: title bar davranisini baglar ve sekme yonetimini
 * (TabStore) baslatir. Terminal/PTY kurulumunun tamami artik tabs.ts'te.
 */
function bootstrap(): void {
  initTitleBar();

  const rootEl = document.getElementById('terminal-root');
  const tabbarListEl = document.getElementById('tabbar-list');
  const newTabBtn = document.getElementById('new-tab-btn');
  if (!rootEl || !tabbarListEl || !newTabBtn) {
    throw new Error('Sekme icin gerekli DOM elemanlari bulunamadi');
  }

  const tabStore = new TabStore(rootEl, tabbarListEl);
  newTabBtn.addEventListener('click', () => void tabStore.createTab());

  window.addEventListener('beforeunload', () => tabStore.disposeAll());

  void tabStore.createTab();
}

bootstrap();
