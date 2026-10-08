import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server";
import { requireAuth, requireCanvasAccess } from "./lib/auth";
import { tableOpValidator } from "./schemas/tableOpsSchema";
import * as TableModels from "./models/tableModels";

/**
 * Écriture d'un node table depuis la grille : chaque geste (cellule validée,
 * ligne ajoutée, colonne renommée, filtre posé…) arrive en opérations,
 * appliquées à l'état courant de la table (cf. `lib/tableOps.ts`). C'est
 * l'autosave de la window, sans bouton ni état « non sauvegardé ».
 *
 * L'agent et le MCP passent par les mêmes opérations (cf.
 * `wrappers/nodeDataWrappers.applyTableOps`).
 */
export const apply = mutation({
  args: {
    nodeDataId: v.id("nodeDatas"),
    ops: v.array(tableOpValidator),
  },
  returns: v.null(),
  handler: async (ctx, { nodeDataId, ops }): Promise<null> => {
    const authUserId = await requireAuth(ctx);
    const nodeData = await ctx.db.get("nodeDatas", nodeDataId);
    if (!nodeData) throw new ConvexError("NodeData not found");
    await requireCanvasAccess(ctx, nodeData.canvasId, authUserId, "editor");

    await TableModels.applyOps(ctx, {
      nodeData,
      ops,
      actor: { type: "user", userId: authUserId },
    });
    return null;
  },
});
