import { v, type Infer } from "convex/values";

const edgesValidator = v.object({
  id: v.string(), // llmid
  status: v.optional(v.literal("trashed")),
  source: v.string(),
  target: v.string(),
  canvasId: v.id("canvases"),
  sourceHandle: v.optional(v.string()),
  targetHandle: v.optional(v.string()),
  markerEnd: v.optional(v.any()),
  data: v.optional(v.record(v.string(), v.any())),
});

/**
 * Champs de l'edge fournis par l'appelant à la création : tout sauf clés
 * système et `status` (réservé à `trash`). `id` (llmId) est optionnel :
 * fourni par le client (création local-first), il est préservé tel quel —
 * idempotent sur le même canvas (retry réseau), conflit refusé
 * cross-canvas (cf. `EdgeModels.createEdges`) ; absent, un llmId unique
 * est généré côté serveur.
 * Une edge est une entité unique — pas de nested `{node, …}` à la
 * `createWithNodeData`.
 */
const edgeCreateItemValidator = v.object({
  id: v.optional(v.string()),
  ...edgesValidator.omit("id", "status").fields,
});

/**
 * Update patchable via `patch` : `data` seul, fusionné en shallow (parité
 * avec le legacy `updateCanvasEdges`, qui ne patchait que `data`).
 */
const edgePatchUpdateValidator = v.object({
  edgeId: v.string(),
  data: v.optional(v.record(v.string(), v.any())),
});

type EdgeCreateItem = Infer<typeof edgeCreateItemValidator>;
type EdgePatchUpdate = Infer<typeof edgePatchUpdateValidator>;

export {
  edgesValidator,
  edgeCreateItemValidator,
  edgePatchUpdateValidator,
};
export type { EdgeCreateItem, EdgePatchUpdate };
