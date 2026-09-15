// Fusion Reciprocal Rank Fusion (Cormack et al., SIGIR 2009) : combine les
// classements keyword et sémantique sans mélanger leurs échelles de score
// (BM25-like vs similarité cosinus, non comparables). Chaque branche vote
// `1 / (k + rang)` par document ; les documents présents des deux côtés
// cumulent. Pur et testable — utilisé par la recherche hybride.

export const RRF_K = 60;

export type RankedInput<THit> = {
  key: string;
  hit: THit;
};

export type FusedOutput<THit> = THit & {
  score: number;
  sources: Array<"keyword" | "semantic">;
};

export function fuseRrf<THit>(
  keyword: RankedInput<THit>[],
  semantic: RankedInput<THit>[],
  k: number = RRF_K,
): FusedOutput<THit>[] {
  const scores = new Map<
    string,
    { hit: THit; score: number; sources: Set<"keyword" | "semantic"> }
  >();
  const accumulate = (list: RankedInput<THit>[], source: "keyword" | "semantic") => {
    list.forEach((entry, rank) => {
      const existing = scores.get(entry.key);
      const increment = 1 / (k + rank + 1);
      if (existing) {
        existing.score += increment;
        existing.sources.add(source);
      } else {
        scores.set(entry.key, {
          hit: entry.hit,
          score: increment,
          sources: new Set([source]),
        });
      }
    });
  };
  accumulate(keyword, "keyword");
  accumulate(semantic, "semantic");
  return Array.from(scores.values())
    .map(({ hit, score, sources }) => ({
      ...hit,
      score,
      sources: Array.from(sources),
    }))
    .sort((a, b) => b.score - a.score);
}
