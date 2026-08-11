import { v } from "convex/values";
import { vAiUsageSource } from "./aiUsageSourceSchema";
import { aiUsageTokensValidator } from "./aiUsageTokensSchema";

/**
 * Journal append-only de la consommation LLM : une ligne par step, puisque le
 * `usageHandler` du composant agent est appelé une fois par step et non une
 * fois par tour. C'est la source de vérité auditable ; les agrégats servis à
 * la page /settings/ai-usage viennent de `aiUsageDaily`.
 *
 * Rétention : purgé au-delà de AI_USAGE_EVENTS_RETENTION_MS par le cron (cf.
 * aiUsage.pruneExpiredEvents). Le rollup, lui, est conservé indéfiniment — un
 * drill-down sur une journée trop ancienne reviendra donc vide alors que ses
 * totaux resteront affichés.
 *
 * Pas de champ `at` : `_creationTime` fait foi et `day` en dérive dans la même
 * mutation, donc les deux ne peuvent pas diverger.
 */
const aiUsageEventsValidator = v.object({
  userId: v.id("users"),
  // Clé de bucket "YYYY-MM-DD" en UTC (cf. lib/usageDay.ts). Largeur fixe, donc
  // l'ordre lexicographique est l'ordre chronologique et une range d'index
  // `gte`/`lte` sur ce champ est une vraie plage de dates.
  day: v.string(),
  source: vAiUsageSource,
  agentName: v.optional(v.string()),
  // Id de modèle OpenRouter complet, ex. "openai/gpt-5.6-luna-pro".
  model: v.string(),
  provider: v.string(),
  threadId: v.optional(v.string()),
  // Dénormalisé depuis threadMetadata quand la ligne existe.
  canvasId: v.optional(v.id("canvases")),

  // ABSENT = OpenRouter n'a pas renvoyé de coût. Un modèle réellement gratuit
  // renvoie `cost: 0`, présent. Ne jamais écrire 0 pour « inconnu » : c'est
  // précisément la confusion que ce champ optionnel permet de lever.
  costUsd: v.optional(v.number()),
  // BYOK : `costUsd` est alors la commission OpenRouter, et celui-ci le coût
  // amont réel du modèle.
  upstreamCostUsd: v.optional(v.number()),

  ...aiUsageTokensValidator.fields,
});

export { aiUsageEventsValidator };
