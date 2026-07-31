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
});

export { nodeDatasValidator };
