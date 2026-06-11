/**
 * Scoring de pertinence pour la recherche (fonctions pures, testables).
 *
 * Convex `withSearchIndex` renvoie les résultats triés par pertinence mais
 * n'expose AUCUN score numérique exploitable. On calcule donc le nôtre, en pur
 * CPU, sur les chunks déjà chargés (zéro lecture DB supplémentaire).
 *
 * Priorités demandées :
 *   1. Un match dans le TITRE prime toujours sur un match dans le BODY.
 *   2. Pour une requête multi-mots, des termes PROCHES les uns des autres
 *      rankent au-dessus de termes éparpillés dans le contenu.
 */

export const RANKING = {
  /** Un match titre domine toujours un match body-only. */
  TITLE_TIER: 100,
  /** Poids de la proximité des termes dans le score d'un champ. */
  PROXIMITY_WEIGHT: 1.5,
  /** Échelle (en caractères) de décroissance de la proximité. */
  WINDOW_SCALE: 120,
  /** Bonus si la requête complète apparaît telle quelle (phrase exacte). */
  PHRASE_BONUS: 0.5,
  /** Garde-fou anti-explosion sur les termes très fréquents. */
  MAX_OCCURRENCES_PER_TERM: 50,
  /** Nombre maximum de nœuds renvoyés après tri. */
  MAX_RESULTS: 30,
} as const;

// Marques diacritiques combinantes (produites par la décomposition NFD).
const COMBINING_DIACRITICS = /[̀-ͯ]/g;

/** Minuscule + suppression des accents/diacritiques (insensible casse et accents). */
export function normalizeForSearch(input: string): string {
  return input.toLowerCase().normalize("NFD").replace(COMBINING_DIACRITICS, "");
}

/** Termes uniques de la requête (normalisés, longueur >= 2). */
export function extractSearchTerms(query: string): string[] {
  return Array.from(
    new Set(
      normalizeForSearch(query)
        .split(/\s+/)
        .map((term) => term.trim())
        .filter((term) => term.length >= 2),
    ),
  );
}

/** Requête complète normalisée et compactée (pour la phrase exacte). */
export function normalizedPhrase(query: string): string {
  return normalizeForSearch(query).replace(/\s+/g, " ").trim();
}

type Occurrence = { start: number; end: number; term: number };

/**
 * Plus petite fenêtre (en caractères) couvrant `distinctTarget` termes distincts.
 * Sliding window classique sur les occurrences triées par position de départ.
 */
function smallestWindowSpan(
  occurrences: Occurrence[],
  distinctTarget: number,
): number {
  if (occurrences.length === 0) return 0;
  const sorted = [...occurrences].sort((a, b) => a.start - b.start);
  const counts = new Map<number, number>();
  let distinct = 0;
  let left = 0;
  let best = Infinity;

  for (let right = 0; right < sorted.length; right++) {
    const r = sorted[right];
    counts.set(r.term, (counts.get(r.term) ?? 0) + 1);
    if (counts.get(r.term) === 1) distinct++;

    while (distinct === distinctTarget) {
      const l = sorted[left];
      best = Math.min(best, r.end - l.start);
      const next = (counts.get(l.term) ?? 0) - 1;
      counts.set(l.term, next);
      if (next === 0) distinct--;
      left++;
    }
  }

  return best === Infinity ? 0 : best;
}

/**
 * Score d'un champ texte : combine la couverture (part des termes trouvés) et
 * la proximité (termes proches => meilleur), plus un bonus de phrase exacte.
 * `phrase` est la requête complète normalisée (cf. {@link normalizedPhrase}).
 */
export function scoreText(
  text: string | undefined,
  terms: string[],
  phrase: string,
): number {
  if (!text || terms.length === 0) return 0;
  const norm = normalizeForSearch(text);
  if (!norm) return 0;

  const occurrences: Occurrence[] = [];
  const matched = new Set<number>();

  for (let ti = 0; ti < terms.length; ti++) {
    const term = terms[ti];
    let from = 0;
    let count = 0;
    while (count < RANKING.MAX_OCCURRENCES_PER_TERM) {
      const idx = norm.indexOf(term, from);
      if (idx === -1) break;
      occurrences.push({ start: idx, end: idx + term.length, term: ti });
      matched.add(ti);
      from = idx + term.length;
      count++;
    }
  }

  if (matched.size === 0) return 0;

  const coverage = matched.size / terms.length;
  let proximity = 1;
  if (matched.size > 1) {
    const span = smallestWindowSpan(occurrences, matched.size);
    proximity = RANKING.WINDOW_SCALE / (RANKING.WINDOW_SCALE + span);
  }

  let score = coverage * (1 + RANKING.PROXIMITY_WEIGHT * proximity);
  if (terms.length > 1 && phrase.length > 0 && norm.includes(phrase)) {
    score += RANKING.PHRASE_BONUS;
  }
  return score;
}

/**
 * Score d'un nœud : le titre est placé dans un palier supérieur (TITLE_TIER)
 * pour qu'un match titre prime TOUJOURS sur un match body-only, tandis que
 * couverture et proximité départagent à l'intérieur de chaque palier.
 */
export function scoreNode(args: {
  title?: string;
  texts: string[];
  terms: string[];
  phrase: string;
}): number {
  const { title, texts, terms, phrase } = args;
  const titleScore = scoreText(title, terms, phrase);
  let bodyBest = 0;
  for (const text of texts) {
    const s = scoreText(text, terms, phrase);
    if (s > bodyBest) bodyBest = s;
  }
  return RANKING.TITLE_TIER * titleScore + bodyBest;
}
