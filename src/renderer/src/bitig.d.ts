import type { BitigApi } from '../../preload/index';

declare global {
  interface Window {
    bitig: BitigApi;
  }
}

export {};
