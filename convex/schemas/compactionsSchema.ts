import { v } from "convex/values";

/**
 * Les compactions d'un thread : la partie ancienne de la conversation,
 * remplacée dans le contexte du modèle par un résumé.
 *
 * Ajout seulement, jamais patché : la dernière ligne du thread fait foi. Le
 * transcript n'est pas touché — l'UI garde tout l'historique, seul le modèle
 * voit le résumé à la place de ce qui précède `firstKept`. Une compaction
 * suivante repart du résumé précédent (il est dans le contexte qu'elle
 * résume).
 */
const compactionsValidator = v.object({
  threadId: v.string(),
  // Le premier message gardé tel quel ; tout ce qui le précède est résumé.
  firstKeptMessageId: v.string(),
  firstKeptOrder: v.number(),
  firstKeptStepOrder: v.number(),
  // Ce que le modèle voit à la place de la partie résumée.
  summary: v.string(),
  // Les messages de l'utilisateur de toute la partie résumée, tels quels
  // (tronqués) : le résumé ne peut pas dériver de ce qui a été demandé.
  // Repris et complétés d'une compaction à l'autre.
  userMessages: v.array(v.string()),
  // Taille du contexte qui a déclenché la compaction.
  tokensBefore: v.number(),
  // `inCache` : le modèle du thread résume son propre contexte, servi depuis
  // le cache. `serialized` : contexte trop gros pour être renvoyé
  // (débordement), résumé à partir d'une transcription tronquée.
  mode: v.union(v.literal("inCache"), v.literal("serialized")),
  model: v.optional(v.string()),
  // Le run qui a déclenché la compaction.
  runMessageId: v.string(),
});

export { compactionsValidator };
