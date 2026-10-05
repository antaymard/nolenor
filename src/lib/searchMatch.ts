export type SearchMatch = { start: number; end: number };

/**
 * Première occurrence de `query` dans `text`, insensible à la casse et aux
 * accents. Les bornes renvoyées indexent `text` tel quel (pour surligner
 * l'extrait), pas sa forme normalisée. `null` sans match ou requête vide.
 */
export function findSearchMatch(
  text: string,
  query: string,
): SearchMatch | null {
  return findSearchMatches(text, query, 1)[0] ?? null;
}

/** Occurrences successives (sans chevauchement) de `query`, au plus `limit`. */
export function findSearchMatches(
  text: string,
  query: string,
  limit = Infinity,
): SearchMatch[] {
  const needle = normalizeQuery(query);
  if (needle === "" || limit <= 0) return [];
  // Normalisation caractère par caractère : un caractère peut perdre ses
  // diacritiques (longueur variable), `origin` ramène chaque caractère
  // normalisé à sa position dans `text`.
  let normalized = "";
  const origin: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const folded = foldChar(text[i]);
    normalized += folded;
    for (let j = 0; j < folded.length; j++) origin.push(i);
  }
  const matches: SearchMatch[] = [];
  let index = normalized.indexOf(needle);
  while (index >= 0 && matches.length < limit) {
    let end = origin[index + needle.length - 1] + 1;
    // Accents combinants (texte décomposé) qui suivent le match : ils ne
    // produisent rien une fois normalisés, mais appartiennent au dernier
    // caractère surligné.
    while (end < text.length && foldChar(text[end]) === "") end++;
    matches.push({ start: origin[index], end });
    index = normalized.indexOf(needle, index + needle.length);
  }
  return matches;
}

function normalizeQuery(query: string) {
  return foldChar(query.trim());
}

function foldChar(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}
