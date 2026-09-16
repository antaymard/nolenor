import { internalQuery } from "../_generated/server";
import { v } from "convex/values";
import {
  listAccessibleCanvases,
  readCanvasById,
} from "../models/canvasModels";

export const read = internalQuery({
  args: {
    canvasId: v.id("canvases"),
  },
  handler: async (ctx, args) => {
    return await readCanvasById(ctx, { canvasId: args.canvasId });
  },
});

/**
 * Les canvas atteignables par l'utilisateur, pour les surfaces LLM (system
 * prompt de Nolë, tool `list_user_canvases`, endpoint MCP).
 *
 * Les canvas PARTAGÉS en font partie depuis que `run_subagent` peut viser un
 * autre canvas : n'en lister que les siens rendait invisible tout ce qu'on
 * venait de lui ouvrir — le modèle ne pouvait pas nommer une cible qu'il
 * n'avait aucun moyen de découvrir.
 */
export const listUserCanvases = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, { userId }) => {
    return await listAccessibleCanvases(ctx, { userId });
  },
});

// `checkCanvasAccessForUser` vivait ici. Il ne regardait que `creatorId` :
// un canvas partagé en editor était refusé au sous-agent, alors qu'un canvas
// créé lui ouvrait tous les tools d'écriture sans distinguer viewer d'editor.
// Son unique appelant (l'ancien `worker.startWorkerTask`) passe désormais par
// `requireCanvasAccess(…, "editor")`, share-aware et commun avec le reste de
// l'app. Supprimé plutôt que laissé en place : une garde plus laxiste que la
// règle générale finit toujours par être réutilisée.
