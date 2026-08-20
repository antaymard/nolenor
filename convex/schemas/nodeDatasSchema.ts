import { v } from "convex/values";
import { nodeTypeValidator } from "./nodeTypeSchema";

// ── Main validator ──────────────────────────────────────────────────────

const nodeDatasValidator = v.object({
  canvasId: v.id("canvases"),
  type: nodeTypeValidator,
  updatedAt: v.number(),
  removedFromCanvasAt: v.optional(v.number()),
  // Présent ssi type === "custom" : le template qui définit les champs et
  // les layouts. Lien autoritaire (une copie write-once existe aussi dans
  // canvasNodes[].data.templateId pour la résolution côté canvas).
  // Les values sont alors keyées par fieldId.
  templateId: v.optional(v.id("nodeTemplates")),
  values: v.record(v.string(), v.any()),
  // Génération d'images en cours ou échouée sur un node "image". Volontairement
  // HORS `values` : un write dans `values` passe par NodeDataModels.updateValues,
  // qui crée un point de restauration, réconcilie les références R2 et replanifie
  // l'indexation de recherche. Un statut d'UI ne doit rien déclencher de tout ça.
  //
  // Le succès n'est pas un état : l'action efface le champ dans la transaction
  // qui appende les images. Il ne reste donc jamais de ligne "terminé".
  imageGeneration: v.optional(
    v.object({
      status: v.union(v.literal("running"), v.literal("error")),
      startedAt: v.number(),
      error: v.optional(v.string()),
    }),
  ),
});

export { nodeDatasValidator };
