import { v } from "convex/values";
import { aiUsageTokensValidator } from "./aiUsageTokensSchema";

/**
 * Rollup dénormalisé de `aiUsageEvents`, incrémenté dans la MÊME mutation que
 * l'insert de l'événement (jamais recalculé : Convex n'a pas d'opérateur de
 * comptage, et un `.collect().length` sur le ledger ne passerait pas à
 * l'échelle).
 *
 * Clé (userId, day, model) : le breakdown par modèle est une exigence de la
 * page, et le total d'un jour se somme en mémoire sur les quelques lignes de ce
 * jour. `source` n'est volontairement PAS dans la clé — ça multiplierait la
 * lecture d'une vue 12 mois pour un découpage que le ledger sait déjà donner
 * sur une fenêtre bornée.
 */
const aiUsageDailyValidator = v.object({
  userId: v.id("users"),
  day: v.string(),
  model: v.string(),

  // Somme des coûts CONNUS uniquement.
  costUsd: v.number(),
  upstreamCostUsd: v.number(),
  eventsCount: v.number(),
  // Nombre de steps agrégés pour lesquels OpenRouter n'a renvoyé aucun coût.
  // > 0 signifie « $0 parce qu'on ne sait pas », à distinguer de « $0 parce que
  // gratuit » : c'est cette colonne que l'UI doit rendre visible.
  eventsMissingCostCount: v.number(),

  ...aiUsageTokensValidator.fields,
});

export { aiUsageDailyValidator };
