import '@xterm/xterm/css/xterm.css';
import { initTitleBar } from './titlebar';
import { TabStore } from './tabs';
import { AppearanceController } from './appearance';
import { SettingsPanel } from './settingsPanel';
import { KeybindingManager } from './keybindings';
import { CommandPalette } from './commandPalette';
import { BetikModal } from './betikModal';
import { HistoryModal } from './historyModal';

/**
 * Uygulama girisi: title bar davranisini baglar, gorunum (tema/opaklik/
 * arkaplan) kontrolcusunu, ayarlar panelini ve sekme yonetimini
 * (TabStore) baslatir.
 */
async function bootstrap(): Promise<void> {
  initTitleBar();

  const rootEl = document.getElementById('terminal-root');
  const tabbarListEl = document.getElementById('tabbar-list');
  const newTabBtn = document.getElementById('new-tab-btn');
  const terminalShellEl = document.getElementById('terminal-shell');
  const settingsPanelEl = document.getElementById('settings-panel');
  const settingsBtn = document.getElementById('settings-btn') as HTMLButtonElement | null;
  const newTabDropdownBtn = document.getElementById('new-tab-dropdown-btn') as HTMLButtonElement | null;
  const profileMenuEl = document.getElementById('profile-dropdown-menu');
  const appEl = document.getElementById('app') || document.body;
  if (!rootEl || !tabbarListEl || !newTabBtn || !terminalShellEl || !settingsPanelEl || !settingsBtn || !newTabDropdownBtn || !profileMenuEl) {
    throw new Error('Sekme/ayarlar icin gerekli DOM elemanlari bulunamadi');
  }

  const appearance = new AppearanceController();
  const keybindings = new KeybindingManager();
  const tabStore = new TabStore(rootEl, tabbarListEl, keybindings, undefined, () => appearance.cycleTheme());
  const settingsPanel = new SettingsPanel(settingsPanelEl, terminalShellEl, settingsBtn, appearance, keybindings);
  const betikModal = new BetikModal(appEl, tabStore);
  const historyModal = new HistoryModal(appEl, tabStore);
  const commandPalette = new CommandPalette(
    appEl,
    tabStore,
    appearance,
    keybindings,
    () => settingsPanel.open(),
    () => betikModal.open(),
    () => historyModal.open()
  );

  keybindings.registerAction('settings.toggle', () => settingsPanel.toggle());
  keybindings.registerAction('palette.toggle', () => commandPalette.toggle());
  keybindings.registerAction('betik.toggle', () => betikModal.toggle());
  keybindings.registerAction('history.search', () => historyModal.toggle());

  // Ilk sekme acilmadan once aktif tema/opaklik/arkaplan uygulanmis olsun;
  // TabStore.createTab() zaten guncel temayla (currentTerminalTheme) acar.
  await appearance.init(tabStore);

  newTabBtn.addEventListener('click', () => void tabStore.createTab());

  // Profil dropdown menusu
  const toggleProfileMenu = (): void => {
    const isHidden = profileMenuEl.classList.contains('hidden');
    if (isHidden) {
      renderProfileMenu();
      profileMenuEl.classList.remove('hidden');
      newTabDropdownBtn.classList.add('active');
    } else {
      closeProfileMenu();
    }
  };

  const closeProfileMenu = (): void => {
    profileMenuEl.classList.add('hidden');
    newTabDropdownBtn.classList.remove('active');
  };

  const renderProfileMenu = (): void => {
    profileMenuEl.replaceChildren();
    const profiles = tabStore.getProfiles();
    profiles.forEach((profile, index) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'profile-dropdown-item';
      const shortcut = index < 9 ? `Ctrl+Shift+${index + 1}` : '';
      item.innerHTML = `
        <span class="profile-dropdown-dot" style="background: ${profile.color || '#7dd3fc'}"></span>
        <span class="profile-dropdown-name">${profile.name}</span>
        ${shortcut ? `<span class="profile-dropdown-shortcut">${shortcut}</span>` : ''}
      `;
      item.addEventListener('click', () => {
        closeProfileMenu();
        void tabStore.createTab(profile.id);
      });
      profileMenuEl.appendChild(item);
    });
  };

  newTabDropdownBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleProfileMenu();
  });

  document.addEventListener('click', (e) => {
    if (!profileMenuEl.contains(e.target as Node) && e.target !== newTabDropdownBtn) {
      closeProfileMenu();
    }
  });

  window.addEventListener('beforeunload', () => tabStore.disposeAll());

  void tabStore.createTab();
}

void bootstrap();

