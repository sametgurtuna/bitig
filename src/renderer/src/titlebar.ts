/**
 * Ozel title bar davranisi: minimize/maximize/close butonlarini window:*
 * IPC kanallarina baglar, maximize durumuna gore buton ikonunu gunceller.
 */
export function initTitleBar(): void {
  const minimizeBtn = document.getElementById('btn-minimize');
  const maximizeBtn = document.getElementById('btn-maximize');
  const closeBtn = document.getElementById('btn-close');

  minimizeBtn?.addEventListener('click', () => window.bitig.windowControls.minimize());
  maximizeBtn?.addEventListener('click', () => window.bitig.windowControls.toggleMaximize());
  closeBtn?.addEventListener('click', () => window.bitig.windowControls.close());

  const restoreIcon =
    '<svg viewBox="0 0 10 10"><rect x="0.5" y="2" width="7.5" height="7.5" /><path d="M2 2V0.5h7.5V8H8" /></svg>';
  const maximizeIcon = '<svg viewBox="0 0 10 10"><rect x="0.5" y="0.5" width="9" height="9" /></svg>';

  const applyMaximizedState = (isMaximized: boolean): void => {
    if (!maximizeBtn) return;
    maximizeBtn.innerHTML = isMaximized ? restoreIcon : maximizeIcon;
    maximizeBtn.title = isMaximized ? 'Geri yukle' : 'Buyut';
  };

  void window.bitig.windowControls.isMaximized().then(applyMaximizedState);
  window.bitig.windowControls.onMaximizeChange((event) => applyMaximizedState(event.isMaximized));
}
