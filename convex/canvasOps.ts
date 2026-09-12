import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireAuth, requireCanvasAccess } from "./lib/auth";
import errors from "./config/errorsConfig";
import * as CanvasModels from "./models/canvasModels";
import * as EdgeModels from "./models/edgeModels";
import * as NodeModels from "./models/nodeModels";
import { canvasOpValidator } from "./schemas/canvasOpsSchema";

/**
 * Les cibles appartiennent-elles bien au canvas dont on a vérifié les droits ?
 *
 * Sans ça, un éditeur du canvas A pourrait nommer des nodes du canvas B et les
 * modifier : l'autorisation est prise UNE fois sur `canvasId`, c'est donc ici
 * que se ferme la porte. Accessoirement, c'est aussi ce qui fait échouer
 * proprement un undo dont la cible a été déplacée ailleurs entre-temps.
 */
async function assertNodesOnCanvas(
  ctx: MutationCtx,
  canvasId: Id<"canvases">,
  nodeIds: Array<string>,
): Promise<void> {
  for (const nodeId of nodeIds) {
    const node = await NodeModels.getNodeOrThrow(ctx, { nodeId });
    if (node.canvasId !== canvasId) {
      throw new ConvexError(errors.NODES_MUST_SHARE_CANVAS);
    }
  }
}

async function assertEdgesOnCanvas(
  ctx: MutationCtx,
  canvasId: Id<"canvases">,
  edgeIds: Array<string>,
): Promise<void> {
  for (const edgeId of edgeIds) {
    const edge = await EdgeModels.getEdgeOrThrow(ctx, { edgeId });
    if (edge.canvasId !== canvasId) {
      throw new ConvexError(errors.EDGES_MUST_SHARE_CANVAS);
    }
  }
}

/**
 * Applique une suite d'opérations de canvas en UNE transaction.
 *
 * C'est le transport de l'undo/redo. Une entrée d'historique arrive entière :
 * annuler la suppression d'un node relié, c'est rendre le node ET ses
 * connexions, et il n'existe aucun instant où l'un serait revenu sans les
 * autres. Un demi-undo serait pire que pas d'undo du tout.
 *
 * L'ordre du tableau fait foi et c'est l'appelant qui le trie (cf.
 * `orderOps` côté client) : une edge ne peut pas être remise en service avant
 * que ses extrémités le soient.
 *
 * Les mutations unitaires (`nodes.trash`, `edges.untrash`, …) restent le
 * chemin des gestes ordinaires ; elles partagent les mêmes models, donc il n'y
 * a pas deux comportements à garantir.
 */
export const apply = mutation({
  args: {
    canvasId: v.id("canvases"),
    ops: v.array(canvasOpValidator),
  },
  returns: v.null(),
  handler: async (ctx, { canvasId, ops }): Promise<null> => {
    const authUserId = await requireAuth(ctx);
    await requireCanvasAccess(ctx, canvasId, authUserId, "editor");

    for (const op of ops) {
      switch (op.kind) {
        case "patchNodes": {
          await assertNodesOnCanvas(
            ctx,
            canvasId,
            op.updates.map((update) => update.nodeId),
          );
          await NodeModels.patchNodes(ctx, {
            updates: op.updates,
            touchCanvas: false,
          });
          break;
        }
        case "trashNodes": {
          await assertNodesOnCanvas(ctx, canvasId, op.nodeIds);
          await NodeModels.trashNodes(ctx, {
            nodeIds: op.nodeIds,
            actor: { type: "user", userId: authUserId },
            touchCanvas: false,
          });
          break;
        }
        case "untrashNodes": {
          await assertNodesOnCanvas(ctx, canvasId, op.nodeIds);
          await NodeModels.untrashNodes(ctx, {
            nodeIds: op.nodeIds,
            touchCanvas: false,
          });
          break;
        }
        case "patchEdges": {
          await assertEdgesOnCanvas(
            ctx,
            canvasId,
            op.updates.map((update) => update.edgeId),
          );
          await EdgeModels.patchEdges(ctx, {
            updates: op.updates,
            touchCanvas: false,
          });
          break;
        }
        case "trashEdges": {
          await assertEdgesOnCanvas(ctx, canvasId, op.edgeIds);
          await EdgeModels.trashEdges(ctx, {
            edgeIds: op.edgeIds,
            touchCanvas: false,
          });
          break;
        }
        case "untrashEdges": {
          await assertEdgesOnCanvas(ctx, canvasId, op.edgeIds);
          await EdgeModels.untrashEdges(ctx, {
            edgeIds: op.edgeIds,
            touchCanvas: false,
          });
          break;
        }
      }
    }

    await CanvasModels.touchCanvas(ctx, canvasId);
    return null;
  },
});
