import { v } from "convex/values";
import { internalQuery } from "../_generated/server";
import { requireCanvasAccess } from "../lib/auth";

/**
 * Contrôle d'accès canvas pour les tool calls MCP. Même modèle que Nole
 * (auth à l'entrée, wrappers internes confiants) : tools read → viewer,
 * tools write → editor. Throw ConvexError (CANVAS_NOT_FOUND /
 * INSUFFICIENT_PERMISSIONS) si refusé.
 */
export const assertCanvasAccess = internalQuery({
  args: {
    canvasId: v.id("canvases"),
    userId: v.id("users"),
    minPermission: v.union(v.literal("viewer"), v.literal("editor")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireCanvasAccess(
      ctx,
      args.canvasId,
      args.userId,
      args.minPermission,
    );
    return null;
  },
});
