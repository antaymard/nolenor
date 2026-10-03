import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const modeValidator = v.union(
  v.literal("sliding"),
  v.literal("fixed"),
  v.literal("eager"),
);

export default defineSchema({
  // Un document = une fenêtre de debounce ouverte pour (namespace, key).
  // Il disparaît dès que la fenêtre se referme (exécution, cancel, flush) :
  // la table ne contient que l'état vivant, jamais d'historique.
  windows: defineTable({
    namespace: v.string(),
    key: v.string(),

    // Figés à l'ouverture de la fenêtre : un appel ultérieur avec un autre
    // mode ne change pas la sémantique d'une fenêtre déjà en cours.
    mode: modeValidator,
    delay: v.number(), // ms ; en eager, durée du cooldown

    // Cible : remplacée à chaque appel (dernier appel gagnant), handle ET
    // args ensemble — sinon on exécuterait l'ancienne fonction avec les
    // nouveaux arguments.
    functionHandle: v.string(),
    functionName: v.string(), // lisibilité dashboard / logs uniquement
    functionArgs: v.any(),

    // true si une exécution est due à l'échéance. Toujours vrai en
    // sliding/fixed ; en eager, faux pendant un cooldown sans appel traînant.
    pending: v.boolean(),

    // Échéance logique. En sliding, elle avance à chaque appel sans toucher
    // au scheduler : c'est le timer qui se réarme paresseusement.
    runAt: v.number(),
    // Plafond de runAt en sliding (`maxWait`), pour qu'un flux continu
    // d'appels ne repousse pas l'exécution indéfiniment.
    deadline: v.optional(v.number()),

    // Timer courant. `generation` est passé au timer et comparé à
    // l'exécution : seul le dernier timer armé peut agir, les autres
    // (en retard, réarmés, ou doublons) sont des no-op.
    // Optionnel uniquement parce que le timer a besoin de l'_id du document :
    // insert puis patch dans la même transaction, jamais observable absent.
    timerId: v.optional(v.id("_scheduled_functions")),
    generation: v.number(),

    calls: v.number(), // appels absorbés par la fenêtre
  }).index("by_namespace_and_key", ["namespace", "key"]),
});
