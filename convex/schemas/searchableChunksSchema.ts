import { v } from "convex/values";
import { nodeTypeValidator } from "./nodeTypeSchema";

// ── Sub-validators ──────────────────────────────────────────────────────

const chunkTypeValidator = v.union(
  v.literal("node"),
  v.literal("page"),
  v.literal("annotation"),
);

// ── Main validator ──────────────────────────────────────────────────────

const searchableChunksValidator = v.object({
  // Déprécié (étape 1/2) : le rattachement visuel se résout désormais à la
  // lecture via nodeDataId (cf. resolveNodeIds), plus écrit à la création.
  // Les chunks existants gardent leur valeur stockée, ignorée en lecture.
  // Étape 2/2 (post-transition) : supprimer le champ + l'index `by_nodeId`.
  nodeId: v.optional(v.string()),
  nodeDataId: v.id("nodeDatas"),
  canvasId: v.id("canvases"),
  chunkType: chunkTypeValidator,
  nodeType: nodeTypeValidator,
  templateId: v.optional(v.string()),
  title: v.optional(v.string()),
  text: v.string(),
  order: v.number(),
  metadata: v.optional(v.record(v.string(), v.any())),
});

export { searchableChunksValidator, chunkTypeValidator };
