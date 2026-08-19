export const QUAKE_CHANNELS = {
  toggle: 'quake:toggle',
  setHotkey: 'quake:set-hotkey'
} as const;

export interface QuakeSettings {
  enabled: boolean;
  hotkey: string; // e.g. 'Control+`' or 'F12'
  heightPercent: number; // 20 - 90 %
  autoHideOnBlur: boolean;
}

export const DEFAULT_QUAKE_SETTINGS: QuakeSettings = {
  enabled: true,
  hotkey: 'Control+`',
  heightPercent: 45,
  autoHideOnBlur: false
};
