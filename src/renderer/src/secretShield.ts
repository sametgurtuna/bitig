export interface SecretMatch {
  type: 'github_pat' | 'openai_key' | 'aws_key' | 'bearer_token' | 'private_key';
  masked: string;
}

/**
 * Gizli Anahtar Kalkani (Secret Shield):
 * Terminal ciktilarinda ve komutlarda yer alan API anahtarlari, token ve sertifikalari
 * tespit eder ve ekran paylasimi/omuz ustu izleme sizintilarina karsi maskeler.
 */
export class SecretShield {
  private static readonly PATTERNS: { type: SecretMatch['type']; regex: RegExp; replace: (match: string) => string }[] = [
    {
      type: 'github_pat',
      regex: /ghp_[a-zA-Z0-9]{36}|github_pat_[a-zA-Z0-9_]{82}/g,
      replace: (m) => m.slice(0, 4) + '*'.repeat(m.length - 4)
    },
    {
      type: 'openai_key',
      regex: /sk-(?:proj-)?[a-zA-Z0-9_-]{20,}/g,
      replace: (m) => m.slice(0, 3) + '*'.repeat(m.length - 3)
    },
    {
      type: 'aws_key',
      regex: /AKIA[0-9A-Z]{16}/g,
      replace: (m) => m.slice(0, 4) + '************'
    },
    {
      type: 'bearer_token',
      regex: /(bearer\s+)[a-zA-Z0-9_\-.]{20,}/gi,
      replace: (_m) => 'bearer ********************'
    },
    {
      type: 'private_key',
      regex: /-----BEGIN [A-Z ]+ PRIVATE KEY-----/g,
      replace: () => '-----BEGIN [MASKED] PRIVATE KEY-----'
    }
  ];

  static containsSecret(text: string): boolean {
    return this.PATTERNS.some((p) => p.regex.test(text));
  }

  static mask(text: string): { sanitized: string; hasSecret: boolean } {
    let sanitized = text;
    let hasSecret = false;

    for (const p of this.PATTERNS) {
      p.regex.lastIndex = 0;
      if (p.regex.test(sanitized)) {
        hasSecret = true;
        sanitized = sanitized.replace(p.regex, p.replace);
      }
    }

    return { sanitized, hasSecret };
  }
}
