import type { CommandItem, MatchedCommandItem } from "./commandCenterTypes";

/**
 * Filtrage flou (« subsequence match ») du command center.
 *
 * On ne veut pas d'une recherche plein texte côté serveur ici : la liste des
 * commandes est locale et courte, et l'utilisateur tape des abréviations
 * (« pjt » pour « Projets 2026 »). Un match par sous-séquence avec bonus de
 * contiguïté / début de mot donne l'ordre attendu sans dépendance externe.
 */

const CONSECUTIVE_BONUS = 8;
const WORD_START_BONUS = 6;
const PREFIX_BONUS = 12;
const GAP_PENALTY = 1;
const MAX_GAP_PENALTY = 10;
/** Départage deux matchs équivalents en faveur du libellé le plus court. */
const LENGTH_PENALTY = 0.05;
/** Un match sur un mot-clé (invisible) vaut moins qu'un match sur le libellé. */
const KEYWORD_SCORE_RATIO = 0.5;

const WORD_CHARACTER = /[\p{L}\p{N}]/u;

type Normalized = {
  /** Un caractère (code point) par entrée, sans accent et en minuscules. */
  chars: string[];
  /** `true` si le caractère démarre un mot (début, après séparateur, camelCase). */
  wordStarts: boolean[];
};

/**
 * Découpe en code points plutôt qu'en unités UTF-16 : les index renvoyés dans
 * `matchedIndices` sont donc des index de code points, et le surlignage doit
 * découper le libellé de la même façon (`Array.from`).
 */
function normalize(text: string): Normalized {
  const source = Array.from(text);
  const chars: string[] = [];
  const wordStarts: boolean[] = [];

  source.forEach((char, index) => {
    // NFD sépare la lettre de son accent : on ne garde que la lettre de base,
    // ce qui laisse le mapping index → caractère intact.
    chars.push(char.normalize("NFD")[0].toLowerCase());

    const previous = index > 0 ? source[index - 1] : undefined;
    wordStarts.push(
      previous === undefined ||
        !WORD_CHARACTER.test(previous) ||
        (previous === previous.toLowerCase() && char !== char.toLowerCase()),
    );
  });

  return { chars, wordStarts };
}

function normalizeQuery(query: string): string[] {
  return Array.from(query.trim())
    .filter((char) => char.trim().length > 0)
    .map((char) => char.normalize("NFD")[0].toLowerCase());
}

/**
 * Cherche `queryChars` comme sous-séquence de `text`.
 * Renvoie `null` si un caractère manque, sinon un score et les index matchés.
 */
export function fuzzyMatch(
  text: string,
  queryChars: string[],
): { score: number; matchedIndices: number[] } | null {
  if (queryChars.length === 0) return { score: 0, matchedIndices: [] };

  const { chars, wordStarts } = normalize(text);
  const matchedIndices: number[] = [];
  let score = 0;
  let previousIndex = -1;

  for (const queryChar of queryChars) {
    const index = chars.indexOf(queryChar, previousIndex + 1);
    if (index === -1) return null;

    if (index === previousIndex + 1 && previousIndex !== -1) {
      score += CONSECUTIVE_BONUS;
    }
    if (index === 0) {
      score += PREFIX_BONUS;
    } else if (wordStarts[index]) {
      score += WORD_START_BONUS;
    }
    const gap = previousIndex === -1 ? 0 : index - previousIndex - 1;
    score -= Math.min(gap, MAX_GAP_PENALTY) * GAP_PENALTY;

    matchedIndices.push(index);
    previousIndex = index;
  }

  score -= chars.length * LENGTH_PENALTY;

  return { score, matchedIndices };
}

/**
 * Filtre et ordonne les commandes. Requête vide => tout, dans l'ordre fourni.
 */
export function filterCommands(
  items: CommandItem[],
  query: string,
): MatchedCommandItem[] {
  const queryChars = normalizeQuery(query);
  if (queryChars.length === 0) {
    return items.map((item) => ({ ...item, matchedIndices: [] }));
  }

  const scored: Array<{ item: MatchedCommandItem; score: number }> = [];

  for (const item of items) {
    const labelMatch = fuzzyMatch(item.label, queryChars);
    if (labelMatch) {
      scored.push({
        item: { ...item, matchedIndices: labelMatch.matchedIndices },
        score: labelMatch.score,
      });
      continue;
    }

    // Repli sur les mots-clés : ils ne sont pas affichés, donc pas surlignés.
    const keywordScore = (item.keywords ?? []).reduce<number | null>(
      (best, keyword) => {
        const match = fuzzyMatch(keyword, queryChars);
        if (!match) return best;
        return best === null ? match.score : Math.max(best, match.score);
      },
      null,
    );
    if (keywordScore !== null) {
      scored.push({
        item: { ...item, matchedIndices: [] },
        score: keywordScore * KEYWORD_SCORE_RATIO,
      });
    }
  }

  // `sort` est stable en JS : à score égal l'ordre de déclaration est conservé.
  return scored.sort((a, b) => b.score - a.score).map(({ item }) => item);
}
