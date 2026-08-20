// Akilli komut tamamlama (inline ghost text) icin paylasilan IPC sozlesmesi.

export const COMPLETION_CHANNELS = {
  context: 'completion:context'
} as const;

export interface CompletionContext {
  /** Baglamin uretildigi calisma dizini. */
  cwd: string;
  /** package.json > scripts anahtarlarindan turetilen "npm run <ad>" komutlari. */
  scripts: string[];
  /** Makefile hedeflerinden turetilen "make <hedef>" komutlari. */
  makeTargets: string[];
  /** Dizindeki alt klasor adlari (yalniz `cd ` baglaminda kullanilir). */
  directories: string[];
  /** Dizindeki dosya adlari (yalniz yol baglaminda kullanilir). */
  files: string[];
}

export const EMPTY_COMPLETION_CONTEXT: CompletionContext = {
  cwd: '',
  scripts: [],
  makeTargets: [],
  directories: [],
  files: []
};
