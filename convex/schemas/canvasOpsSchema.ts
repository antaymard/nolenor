import { v, type Infer } from "convex/values";
import { nodePatchUpdateValidator } from "./nodesSchema";
import { edgePatchUpdateValidator } from "./edgesSchema";

/**
 * Le vocabulaire d'opérations du canvas, et rien d'autre : six verbes qui se
 * répondent deux à deux (patch↔patch, trash↔untrash) sur les nodes et sur les
 * edges.
 *
 * C'est l'alphabet de l'undo. Une entrée d'historique n'est qu'une liste de
 * ces opérations dans un sens, et la liste inverse dans l'autre — ce qui rend
 * le redo gratuit : c'est l'inverse de l'inverse.
 *
 * Pas de verbe `create`. Annuler une création, c'est `trashNodes` ; la
 * refaire, c'est `untrashNodes`. Recréer donnerait un nouveau `nodeDataId` et
 * laisserait derrière le contenu saisi, l'historique de versions, les
 * références R2 et les chunks de recherche du node d'origine.
 */
const canvasOpValidator = v.union(
  v.object({
    kind: v.literal("patchNodes"),
    updates: v.array(nodePatchUpdateValidator),
  }),
  v.object({
    kind: v.literal("trashNodes"),
    nodeIds: v.array(v.string()),
  }),
  v.object({
    kind: v.literal("untrashNodes"),
    nodeIds: v.array(v.string()),
  }),
  v.object({
    kind: v.literal("patchEdges"),
    updates: v.array(edgePatchUpdateValidator),
  }),
  v.object({
    kind: v.literal("trashEdges"),
    edgeIds: v.array(v.string()),
  }),
  v.object({
    kind: v.literal("untrashEdges"),
    edgeIds: v.array(v.string()),
  }),
);

type CanvasOp = Infer<typeof canvasOpValidator>;

export { canvasOpValidator };
export type { CanvasOp };
