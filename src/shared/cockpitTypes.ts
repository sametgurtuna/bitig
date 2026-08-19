export const COCKPIT_CHANNELS = {
  openUrl: 'cockpit:open-url',
  openFile: 'cockpit:open-file'
} as const;

export interface DiscoveredPort {
  port: number;
  url: string;
  tabId: string;
  leafId: string;
  detectedAt: number;
}

export interface CockpitSettings {
  enablePortSniffer: boolean;
  enableSecretShield: boolean;
  openLinksInEditor: boolean;
}

export const DEFAULT_COCKPIT_SETTINGS: CockpitSettings = {
  enablePortSniffer: true,
  enableSecretShield: true,
  openLinksInEditor: true
};
