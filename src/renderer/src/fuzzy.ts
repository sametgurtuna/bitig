export interface FuzzyResult {
  matches: boolean;
  score: number;
  highlightIndices: number[];
}

/**
 * Hizli ve esnek fuzzy esleme motoru.
 * Karakter sirasi, kelime baslari, ardil eslesmeler ve onek eslesmelerini puanlar.
 */
export function fuzzyScore(query: string, target: string): FuzzyResult {
  if (!query) {
    return { matches: true, score: 0, highlightIndices: [] };
  }

  const q = query.toLowerCase();
  const t = target.toLowerCase();

  let qIdx = 0;
  let tIdx = 0;
  let score = 0;
  let consecutive = 0;
  const highlightIndices: number[] = [];

  while (qIdx < q.length && tIdx < t.length) {
    if (q[qIdx] === t[tIdx]) {
      highlightIndices.push(tIdx);
      score += 10;

      // Arka arkaya eslesme bonusu
      score += consecutive * 5;
      consecutive++;

      // Kelime basi bonusu (bosluk, tire, alt cizgi, nokta veya dizgi basi)
      if (tIdx === 0 || /[\s\-_./\\:]/.test(target[tIdx - 1])) {
        score += 15;
      }

      // Buyuk harf (CamelCase) baslangic bonusu
      if (target[tIdx] !== t[tIdx] && (tIdx === 0 || target[tIdx - 1] === t[tIdx - 1])) {
        score += 10;
      }

      qIdx++;
    } else {
      consecutive = 0;
    }
    tIdx++;
  }

  const matches = qIdx === q.length;
  if (!matches) {
    return { matches: false, score: 0, highlightIndices: [] };
  }

  // Daha kisa hedeflere uzunluk cezasi yerine yakinlik bonusu
  score -= (t.length - q.length) * 0.5;

  return { matches: true, score, highlightIndices };
}
