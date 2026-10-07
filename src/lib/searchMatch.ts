export type SearchMatch = { start: number; end: number };

/**
 * Forme normalisée d'un texte, à préparer une fois (cf.
 * `prepareSearchText`) quand on y cherche plusieurs requêtes successives :
 * la normalisation coûte bien plus cher que la recherche elle-même.
 */
export type PreparedSearchText = {
  text: string;
  normalized: string;
  /** Position dans `text` de chaque caractère de `normalized`. */
  origin: Uint32Array;
};

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
  if (normalizeQuery(query) === "" || limit <= 0) return [];
  return findPreparedMatches(prepareSearchText(text), query, limit);
}

/**
 * Normalisation caractère par caractère : un caractère peut perdre ses
 * diacritiques (longueur variable), `origin` ramène chaque caractère
 * normalisé à sa position dans `text`.
 */
export function prepareSearchText(text: string): PreparedSearchText {
  const parts: string[] = [];
  // Typé plutôt qu'un `number[]` : un PDF fait vite un million de caractères.
  // Un caractère se plie rarement en plusieurs : on agrandit au besoin.
  let origin = new Uint32Array(text.length);
  let length = 0;
  const push = (position: number) => {
    if (length === origin.length) {
      const grown = new Uint32Array(origin.length * 2 + 8);
      grown.set(origin);
      origin = grown;
    }
    origin[length++] = position;
  };
  let i = 0;
  while (i < text.length) {
    // Plage ASCII sans diacritique : un seul `toLowerCase`, positions 1:1.
    const runStart = i;
    while (i < text.length && isPlainAscii(text.charCodeAt(i))) push(i++);
    if (i > runStart) {
      parts.push(text.slice(runStart, i).toLowerCase());
      continue;
    }
    const folded = foldChar(text[i]);
    parts.push(folded);
    for (let j = 0; j < folded.length; j++) push(i);
    i++;
  }
  return {
    text,
    normalized: parts.join(""),
    origin: origin.subarray(0, length),
  };
}

/**
 * Index de recherche mémoïsé par source : les données venant de `useQuery`
 * gardent leur référence tant qu'elles ne changent pas, donc l'index survit
 * aux frappes et aux remontages, et part avec la source.
 */
export function memoizeSearchIndex<Source extends object, Index>(
  build: (source: Source) => Index,
): (source: Source) => Index {
  const cache = new WeakMap<Source, Index>();
  return (source) => {
    let index = cache.get(source);
    if (index === undefined) {
      index = build(source);
      cache.set(source, index);
    }
    return index;
  };
}

/** `findSearchMatch` sur un texte déjà préparé. */
export function findPreparedMatch(
  prepared: PreparedSearchText,
  query: string,
): SearchMatch | null {
  return findPreparedMatches(prepared, query, 1)[0] ?? null;
}

/** `findSearchMatches` sur un texte déjà préparé. */
export function findPreparedMatches(
  prepared: PreparedSearchText,
  query: string,
  limit = Infinity,
): SearchMatch[] {
  const needle = normalizeQuery(query);
  if (needle === "" || limit <= 0) return [];
  const { text, normalized, origin } = prepared;
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
  return foldString(query.trim());
}

/**
 * Raccourci ASCII (l'essentiel d'un texte) : pas de décomposition, et seuls
 * `^` et `` ` `` sont des diacritiques au sens Unicode.
 */
function foldChar(char: string) {
  const code = char.charCodeAt(0);
  if (code < 0x80) {
    if (code >= 65 && code <= 90) return String.fromCharCode(code + 32);
    return code === 94 || code === 96 ? "" : char;
  }
  return foldString(char);
}

function isPlainAscii(code: number) {
  return code < 0x80 && code !== 94 && code !== 96;
}

function foldString(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}
