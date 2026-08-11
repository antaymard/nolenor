import { v } from "convex/values";

/**
 * Compteurs de tokens, partagés par l'événement et le rollup journalier. Ils
 * sont spreadés à plat (`...aiUsageTokensValidator.fields`) dans les deux
 * tables plutôt qu'imbriqués : un `ctx.db.patch` sur un objet imbriqué devrait
 * le réécrire en entier à chaque incrément.
 *
 * ATTENTION AUX DOUBLES COMPTES CÔTÉ UI. La sémantique vient de
 * `asLanguageModelUsage` (ai@6) :
 *   inputTokens  INCLUT cachedInputTokens et cacheWriteTokens
 *   outputTokens INCLUT reasoningTokens
 *   totalTokens  = inputTokens + outputTokens
 * Les sous-compteurs sont des détails, jamais des termes à additionner aux
 * totaux.
 *
 * `noCacheTokens` et `textTokens` ne sont pas stockés : ce sont des dérivées
 * exactes (`input - cacheRead`, `output - reasoning`), les garder ne créerait
 * qu'un piège de cohérence.
 *
 * Tous requis, 0 par défaut : contrairement au coût, « absent » et « zéro »
 * n'ont pas de valeur informative différente pour un compteur de tokens, et ça
 * rend l'arithmétique du rollup triviale.
 */
const aiUsageTokensValidator = v.object({
  inputTokens: v.number(),
  cachedInputTokens: v.number(),
  cacheWriteTokens: v.number(),
  outputTokens: v.number(),
  reasoningTokens: v.number(),
  totalTokens: v.number(),
});

type AiUsageTokens = typeof aiUsageTokensValidator.type;

export { aiUsageTokensValidator, type AiUsageTokens };
