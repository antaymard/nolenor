/** Match insensible à la casse et aux accents ; une requête vide matche tout. */
export function matchesSearchQuery(text: string, query: string): boolean {
  return normalizeQuery(query) === "" || findSearchMatch(text, query) !== null;
}

/**
 * Première occurrence de `query` dans `text`, insensible à la casse et aux
 * accents. Les bornes renvoyées indexent `text` tel quel (pour surligner
 * l'extrait), pas sa forme normalisée. `null` sans match ou requête vide.
 */
export function findSearchMatch(
  text: string,
  query: string,
): { start: number; end: number } | null {
  const needle = normalizeQuery(query);
  if (needle === "") return null;
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
  const index = normalized.indexOf(needle);
  if (index < 0) return null;
  let end = origin[index + needle.length - 1] + 1;
  // Accents combinants (texte décomposé) qui suivent le match : ils ne
  // produisent rien une fois normalisés, mais appartiennent au dernier
  // caractère surligné.
  while (end < text.length && foldChar(text[end]) === "") end++;
  return { start: origin[index], end };
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
