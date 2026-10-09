import { v, type Infer } from "convex/values";

/**
 * Une recipe : une tâche confiée à Nolë, lancée à la main ou à heures fixes.
 *
 * Elle appartient à l'utilisateur, pas au canvas : on la gère depuis les
 * réglages, et un TaskNode n'en est qu'un raccourci (`values: { recipeId }`).
 * Elle ne vit surtout pas dans un nodeData : dupliquer le node la ferait
 * tourner deux fois, et n'importe quel éditeur du canvas pourrait réécrire ce
 * qui s'exécute au nom du propriétaire.
 *
 * Lancer une recipe = envoyer ses instructions à Nolë dans un nouveau thread,
 * comme un message du chat (cf. models/recipeModels.ts). Une routine et une
 * automation ne sont que des recipes avec des déclencheurs.
 */

/**
 * Créneaux prédéfinis plutôt qu'une expression cron : la fréquence minimale
 * (une fois par heure) est garantie par la forme même, et c'est exactement ce
 * que l'UI affiche. Heures et jours s'entendent dans `timezone` (IANA).
 */
const vRecipeSchedule = v.union(
  v.object({
    kind: v.literal("schedule"),
    every: v.literal("hour"),
    timezone: v.string(),
  }),
  v.object({
    kind: v.literal("schedule"),
    every: v.literal("day"),
    // "HH:MM", heure locale.
    at: v.string(),
    timezone: v.string(),
  }),
  v.object({
    kind: v.literal("schedule"),
    every: v.literal("week"),
    at: v.string(),
    // 0 = dimanche … 6 = samedi, comme `Date.getDay()`.
    days: v.array(v.number()),
    timezone: v.string(),
  }),
);

// Lançable au clic par les autres membres du canvas (TaskNode). Le
// propriétaire peut toujours la lancer depuis les réglages.
const vRecipeManualTrigger = v.object({ kind: v.literal("manual") });

// Un seul lancement, à un instant précis (« rappelle-moi demain à 14 h »).
// Une fois passé, le déclencheur reste mais ne compte plus : la recipe n'est
// pas désactivée, pour que ses autres déclencheurs continuent de marcher.
const vRecipeOnceTrigger = v.object({
  kind: v.literal("once"),
  // Instant UTC, en ms.
  at: v.number(),
});

const vRecipeTrigger = v.union(
  vRecipeManualTrigger,
  vRecipeSchedule,
  vRecipeOnceTrigger,
);

const recipesValidator = v.object({
  // Le propriétaire : une routine tourne en son nom.
  userId: v.id("users"),
  name: v.string(),
  // Le message envoyé à Nolë. Peut mentionner des nodes du canvas.
  instructions: v.string(),
  // Le canvas où le run s'exécute.
  canvasId: v.id("canvases"),
  triggers: v.array(vRecipeTrigger),
  enabled: v.boolean(),
  // Prochain lancement planifié. Présent seulement pour une recipe active qui
  // a un lancement à venir (créneau, ou `once` futur) : c'est ce que lit le
  // cron (index `by_nextRunAt`).
  nextRunAt: v.optional(v.number()),
  lastRunAt: v.optional(v.number()),
  updatedAt: v.number(),
});

type RecipeSchedule = Infer<typeof vRecipeSchedule>;
type RecipeTrigger = Infer<typeof vRecipeTrigger>;

export {
  recipesValidator,
  vRecipeSchedule,
  vRecipeTrigger,
  type RecipeSchedule,
  type RecipeTrigger,
};
