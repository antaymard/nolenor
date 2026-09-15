// Requête keyword (opérateurs `"phrase"`, `-exclu`, `OR`) → texte naturel pour
// l'embedding (`voyage-4-lite`, `input_type: "query"`).
//
// Le modèle embed tout le string comme du langage naturel : il ne comprend
// pas la syntaxe keyword (interprétée, elle, par `lib/searchQuery.ts` côté
// branche full-text). Sans nettoyage, les guillemets / tirets / `OR` polluent
// le vecteur et les deux branches d'une recherche hybride ne cherchent plus
// la même chose. Best effort : les exclusions multi-mots (`-"a b"`) et la
// négation sémantique restent hors de portée d'un embedding.

/** Termes préfixés `-` (requête splittée sur les espaces, minusculés). */
export function extractExcludedTerms(query: string): string[] {
  const terms: string[] = [];
  for (const token of query.split(/\s+/)) {
    if (!token.startsWith("-") || token.length <= 1) continue;
    const term = token
      .slice(1)
      .replace(/^"+|"+$/g, "")
      .trim()
      .toLowerCase();
    if (term.length > 0) terms.push(term);
  }
  return [...new Set(terms)];
}

/**
 * Version "affirmative" d'une requête keyword : opérateurs retirés, mots
 * conservés (`"a b"` → `a b`, `-x` supprimé, `a OR b` → `a b`). Si le
 * nettoyage vide la requête, retourne la requête brute (jamais de casse).
 */
export function toEmbeddingQuery(query: string): string {
  const cleaned = query
    .split(/\s+/)
    .filter((token) => !(token.startsWith("-") && token.length > 1))
    .join(" ")
    .replace(/"/g, "")
    .replace(/\bOR\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > 0 ? cleaned : query.trim();
}

/** Un chunk est écarté si son texte contient un terme exclu (insensible casse). */
export function containsExcludedTerm(
  text: string,
  excludedTerms: string[],
): boolean {
  if (excludedTerms.length === 0) return false;
  const lower = text.toLowerCase();
  return excludedTerms.some((term) => lower.includes(term));
}
