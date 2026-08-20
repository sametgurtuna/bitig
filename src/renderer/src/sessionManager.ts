/**
 * Oturum Kurtarma (Session Restore) Yoneticisi.
 *
 * Acilista onceki acik sekme profilleri, basliklari ve calisma dizinlerini
 * geri yukler ve kapanirken otomatik olarak yerel depolamaya (localStorage) kaydeder.
 */

export interface SavedTabSession {
  profileId: string;
  title: string;
  cwd?: string;
}

export interface SavedSessionState {
  tabs: SavedTabSession[];
  activeTabIndex: number;
}

const SESSION_STORAGE_KEY = 'bitig:session_state';

export class SessionManager {
  saveSession(tabs: SavedTabSession[], activeTabIndex: number): void {
    try {
      const state: SavedSessionState = {
        tabs,
        activeTabIndex: Math.max(0, Math.min(activeTabIndex, tabs.length - 1))
      };
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error('[Bitig] Oturum kaydedilemedi:', e);
    }
  }

  loadSession(): SavedSessionState | null {
    try {
      const raw = localStorage.getItem(SESSION_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as SavedSessionState;
      if (Array.isArray(parsed.tabs) && parsed.tabs.length > 0) {
        return parsed;
      }
      return null;
    } catch {
      return null;
    }
  }

  clearSession(): void {
    try {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    } catch {
      // sessizce gec
    }
  }
}
