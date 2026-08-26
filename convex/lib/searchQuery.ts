/**
 * Parsing d'une requête de recherche « façon Google » (fonctions pures, testables).
 *
 * Pourquoi ce module existe : `q.search()` de Convex renvoie les documents où
 * AU MOINS UN mot de la requête apparaît, classés par pertinence (cf. les types
 * de convex : « returns results where any word of `query` appears in the
 * field »). Taper trois mots remonte donc des nodes qui n'en contiennent qu'un.
 *
 * Ce module traduit la saisie en contraintes que l'appelant applique APRÈS la
 * recherche indexée :
 *   `alpha beta`        → les deux mots doivent être présents (AND)
 *   `"revue de code"`   → phrase contiguë obligatoire
 *   `-brouillon`        → le mot ne doit apparaître nulle part (mot entier)
 *   `-"note interne"`   → idem pour une phrase
 *   `alpha OR beta`     → au moins l'un des deux (gratuit : c'est le natif)
 *
 * Le OR n'entraîne donc AUCUNE requête supplémentaire ; seules les exclusions
 * en coûtent (l'appelant doit vérifier tout le node, pas seulement les chunks
 * déjà remontés).
 */

import { normalizeForSearch } from "./searchScoring";

export const SEARCH_QUERY_LIMITS = {
  /** Limite Convex : une requête `.search()` accepte au plus 16 termes. */
  MAX_SEARCH_TERMS: 16,
  /** Borne le fan-out : chaque exclusion coûte des recherches supplémentaires. */
  MAX_EXCLUSIONS: 3,
  /** En dessous, un terme n'apporte rien (aligné sur `extractSearchTerms`). */
  MIN_TERM_LENGTH: 2,
} as const;

/** Un mot ou une phrase à exclure : `normalized` filtre, `original` interroge l'index. */
export type ExcludedNeedle = {
  normalized: string;
  original: string;
};

export type ParsedSearchQuery = {
  /** Chaîne passée à `q.search()` : mots positifs d'origine, dédupliqués, plafonnés. */
  searchText: string;
  /** Mots obligatoires, normalisés (AND). */
  required: string[];
  /** Phrases exactes obligatoires, normalisées. */
  phrases: string[];
  /** Groupes OR : au moins un membre de chaque groupe doit être présent. */
  orGroups: string[][];
  /** Mots et phrases à exclure. */
  excluded: ExcludedNeedle[];
  /** Mots positifs d'origine (accents et casse conservés) pour extraits + surlignage. */
  highlightTerms: string[];
  /** Équivalents normalisés de `highlightTerms`, pour le scoring. */
  normalizedTerms: string[];
  /** Aucun mot positif : il n'y a rien à chercher. */
  isEmpty: boolean;
};

type RawToken = {
  /** Texte d'origine, débarrassé du `-` et des guillemets. */
  value: string;
  isPhrase: boolean;
  isNegated: boolean;
  isOrKeyword: boolean;
};

/** Normalise et compacte les espaces (une phrase peut en contenir plusieurs). */
function normalizeNeedle(value: string): string {
  return normalizeForSearch(value).replace(/\s+/g, " ").trim();
}

/**
 * Découpe la saisie en tokens en gardant leur ORDRE : le regroupement OR en
 * dépend, et c'est exactement ce qu'une extraction par regex globale perd.
 */
function tokenize(input: string): RawToken[] {
  const tokens: RawToken[] = [];
  let index = 0;

  while (index < input.length) {
    if (/\s/.test(input[index])) {
      index++;
      continue;
    }

    // Un `-` ne nie que s'il colle à du contenu (`-mot`, pas `- mot`).
    let isNegated = false;
    if (input[index] === "-") {
      const next = input[index + 1];
      if (next !== undefined && !/\s/.test(next)) {
        isNegated = true;
        index++;
      }
    }

    if (input[index] === '"') {
      const closing = input.indexOf('"', index + 1);
      if (closing === -1) {
        // Guillemet jamais refermé : le reste redevient des mots ordinaires,
        // le `-` éventuel ne portant que sur le premier.
        for (const word of input.slice(index + 1).split(/\s+/).filter(Boolean)) {
          tokens.push({
            value: word,
            isPhrase: false,
            isNegated,
            isOrKeyword: false,
          });
          isNegated = false;
        }
        break;
      }

      const phrase = input.slice(index + 1, closing).trim();
      if (phrase) {
        tokens.push({
          value: phrase,
          isPhrase: true,
          isNegated,
          isOrKeyword: false,
        });
      }
      index = closing + 1;
      continue;
    }

    let end = index;
    while (end < input.length && !/[\s"]/.test(input[end])) end++;
    const word = input.slice(index, end);
    index = end;
    if (!word) continue;

    tokens.push({
      value: word,
      isPhrase: false,
      isNegated,
      isOrKeyword: !isNegated && word === "OR",
    });
  }

  return tokens;
}

/** Ajoute `value` s'il est absent, comparaison insensible à la casse. */
function pushUnique(target: string[], seen: Set<string>, value: string): void {
  const key = value.toLowerCase();
  if (seen.has(key)) return;
  seen.add(key);
  target.push(value);
}

export function parseSearchQuery(input: string): ParsedSearchQuery {
  const { MAX_SEARCH_TERMS, MAX_EXCLUSIONS, MIN_TERM_LENGTH } =
    SEARCH_QUERY_LIMITS;

  const tokens = tokenize(input);

  const excluded: ExcludedNeedle[] = [];
  const positives: RawToken[] = [];

  for (const token of tokens) {
    if (!token.isNegated) {
      positives.push(token);
      continue;
    }
    if (excluded.length >= MAX_EXCLUSIONS) continue;
    const normalized = normalizeNeedle(token.value);
    if (normalized.length < MIN_TERM_LENGTH) continue;
    if (excluded.some((entry) => entry.normalized === normalized)) continue;
    excluded.push({ normalized, original: token.value });
  }

  const required: string[] = [];
  const phrases: string[] = [];
  const orGroups: string[][] = [];

  // Chaque token ouvre un groupe d'un membre ; le groupe ne grossit que si un
  // `OR` suit. Fermer le groupe dès qu'un membre isolé arrive évite le bug
  // classique où `a OR b c` avale `c` dans le groupe.
  let group: RawToken[] = [];
  let pendingOr = false;

  const flushGroup = () => {
    const members = group
      .map((token) => ({ token, normalized: normalizeNeedle(token.value) }))
      .filter(({ normalized }) => normalized.length >= MIN_TERM_LENGTH);
    group = [];

    if (members.length === 0) return;
    if (members.length === 1) {
      const [{ token, normalized }] = members;
      const target = token.isPhrase ? phrases : required;
      if (!target.includes(normalized)) target.push(normalized);
      return;
    }

    const needles = Array.from(
      new Set(members.map(({ normalized }) => normalized)),
    );
    if (needles.length === 1) {
      if (!required.includes(needles[0])) required.push(needles[0]);
      return;
    }
    orGroups.push(needles);
  };

  for (const token of positives) {
    if (token.isOrKeyword) {
      // `OR` en tête de requête n'a rien à relier : on l'ignore.
      pendingOr = group.length > 0;
      continue;
    }
    if (pendingOr) {
      group.push(token);
      pendingOr = false;
      continue;
    }
    flushGroup();
    group = [token];
  }
  flushGroup();

  // `searchText` et `highlightTerms` : mots d'ORIGINE (l'index Convex applique
  // sa propre normalisation, et le surlignage doit matcher le texte accentué).
  const searchWords: string[] = [];
  const searchSeen = new Set<string>();
  const highlightTerms: string[] = [];
  const highlightSeen = new Set<string>();

  // Les mots simples d'abord, les phrases ensuite : si le plafond de 16 termes
  // est atteint, mieux vaut avoir gardé les contraintes les plus discriminantes.
  const ordered = [
    ...positives.filter((token) => !token.isOrKeyword && !token.isPhrase),
    ...positives.filter((token) => !token.isOrKeyword && token.isPhrase),
  ];

  for (const token of ordered) {
    for (const word of token.value.split(/\s+/).filter(Boolean)) {
      if (normalizeNeedle(word).length < MIN_TERM_LENGTH) continue;
      pushUnique(highlightTerms, highlightSeen, word);
      if (searchWords.length < MAX_SEARCH_TERMS) {
        pushUnique(searchWords, searchSeen, word);
      }
    }
  }

  return {
    searchText: searchWords.join(" "),
    required,
    phrases,
    orGroups,
    excluded,
    highlightTerms,
    normalizedTerms: highlightTerms.map((term) => normalizeNeedle(term)),
    isEmpty: searchWords.length === 0,
  };
}

// ── Prédicats de filtrage ───────────────────────────────────────────────────
// Les textes sont normalisés UNE fois par node (`normalizeHaystacks`) puis
// réutilisés par tous les prédicats : la recherche est débouncée mais chaude.

/** Normalise titre + contenus d'un node en une liste de bottes de foin. */
export function normalizeHaystacks(
  values: Array<string | undefined | null>,
): string[] {
  const normalized: string[] = [];
  for (const value of values) {
    if (!value) continue;
    const text = normalizeForSearch(value);
    if (text) normalized.push(text);
  }
  return normalized;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Sous-chaîne : suffisant pour les inclusions, où sur-matcher est bénin. */
export function haystacksContainText(
  haystacks: string[],
  needle: string,
): boolean {
  if (!needle) return false;
  return haystacks.some((haystack) => haystack.includes(needle));
}

/**
 * Mot entier, sur du texte déjà normalisé (donc `[^a-z0-9]` borne correctement).
 * Indispensable pour les exclusions : `-java` ne doit pas tuer « javascript ».
 */
export function haystacksContainToken(
  haystacks: string[],
  token: string,
): boolean {
  if (!token) return false;
  const boundary = "[^a-z0-9]";
  const pattern = new RegExp(
    `(^|${boundary})${escapeRegExp(token)}($|${boundary})`,
  );
  return haystacks.some((haystack) => pattern.test(haystack));
}

/** Le node satisfait-il les contraintes positives (phrases, AND, groupes OR) ? */
export function matchesParsedQuery(
  haystacks: string[],
  parsed: ParsedSearchQuery,
): boolean {
  for (const phrase of parsed.phrases) {
    if (!haystacksContainText(haystacks, phrase)) return false;
  }
  for (const term of parsed.required) {
    if (!haystacksContainText(haystacks, term)) return false;
  }
  for (const group of parsed.orGroups) {
    if (!group.some((needle) => haystacksContainText(haystacks, needle))) {
      return false;
    }
  }
  return true;
}

/** Le node porte-t-il l'un des mots exclus ? */
export function hasExcludedNeedle(
  haystacks: string[],
  excluded: ExcludedNeedle[],
): boolean {
  return excluded.some((entry) =>
    haystacksContainToken(haystacks, entry.normalized),
  );
}
