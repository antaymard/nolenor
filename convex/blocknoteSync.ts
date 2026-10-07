import { ConvexError, v } from "convex/values";
import { ProsemirrorSync } from "@convex-dev/prosemirror-sync";
import { components } from "./_generated/api";
import {
  internalQuery,
  mutation,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import type { DataModel, Id } from "./_generated/dataModel";
import { optionalAuth, requireAuth, requireCanvasAccess } from "./lib/auth";
import errors from "./config/errorsConfig";
import * as NodeDataModel from "./models/nodeDataModels";
import { parseStoredBlockNoteDocument } from "./lib/blockNoteDocument";

// Édition collaborative des nodes blocknote (SPIKE).
//
// Le doc vivant est un doc ProseMirror du composant `prosemirror-sync`, dont
// l'id est celui du nodeData. Les éditeurs ouverts s'échangent des steps (OT),
// le composant tient snapshots et historique.
//
// `values.doc` reste la forme lue par TOUT le reste de l'app (vue canvas,
// recherche, versions, export, tools de l'agent). Il en devient une copie :
//   - éditeur → `values.doc` : un éditeur dont tous les steps sont confirmés
//     publie ses blocs (`publishDoc`), seulement s'il est à la dernière
//     version — un autre éditeur plus à jour publiera à son tour ;
//   - autre écriture → doc vivant : toute écriture du `doc` hors de ce chemin
//     (agent, restore, MCP) est poussée dans le doc vivant par
//     `blocknoteSyncNode.pushDocToSync` (cf. NodeDataModel.updateValues).
//
// Un doc vivant naît à la première ouverture en sync, depuis `values.doc`
// (`create` côté client).

export const prosemirrorSync = new ProsemirrorSync<Id<"nodeDatas">>(
  components.prosemirrorSync,
);

async function requireBlocknoteAccess(
  ctx: QueryCtx | MutationCtx,
  id: string,
  permission: "viewer" | "editor",
) {
  const nodeDataId = ctx.db.normalizeId("nodeDatas", id);
  if (!nodeDataId) throw new ConvexError(errors.NODE_DATA_NOT_FOUND);
  const nodeData = await ctx.db.get(nodeDataId);
  if (!nodeData || nodeData.type !== "blocknote") {
    throw new ConvexError(errors.NODE_DATA_NOT_FOUND);
  }
  const userId =
    permission === "viewer" ? await optionalAuth(ctx) : await requireAuth(ctx);
  await requireCanvasAccess(ctx, nodeData.canvasId, userId, permission, {
    allowPublic: permission === "viewer",
  });
  return { nodeData, userId };
}

export const {
  getSnapshot,
  submitSnapshot,
  latestVersion,
  getSteps,
  submitSteps,
} = prosemirrorSync.syncApi<DataModel>({
  checkRead: async (ctx, id) => {
    await requireBlocknoteAccess(ctx, id, "viewer");
  },
  checkWrite: async (ctx, id) => {
    await requireBlocknoteAccess(ctx, id, "editor");
  },
});

/**
 * Publie dans `values.doc` les blocs d'un éditeur synchronisé.
 *
 * L'appelant garantit n'avoir aucun step local non confirmé : ses blocs sont
 * alors exactement le doc à `version`. Ignoré (false) si le doc vivant a
 * avancé depuis — un éditeur plus à jour publiera.
 */
export const publishDoc = mutation({
  args: {
    nodeDataId: v.id("nodeDatas"),
    version: v.number(),
    doc: v.array(v.any()),
  },
  returns: v.boolean(),
  handler: async (ctx, { nodeDataId, version, doc }) => {
    const { userId } = await requireBlocknoteAccess(ctx, nodeDataId, "editor");

    const latest = await ctx.runQuery(
      components.prosemirrorSync.lib.latestVersion,
      { id: nodeDataId },
    );
    if (latest !== version) return false;

    return NodeDataModel.updateValues(ctx, {
      _id: nodeDataId,
      values: { doc },
      actor: { type: "user", userId: userId as Id<"users"> },
      fromSync: true,
    });
  },
});

/** Les blocs stockés d'un blocknote, pour la poussée vers le doc vivant. */
export const readStoredDoc = internalQuery({
  args: { nodeDataId: v.id("nodeDatas") },
  returns: v.union(v.null(), v.array(v.any())),
  handler: async (ctx, { nodeDataId }) => {
    const nodeData = await ctx.db.get(nodeDataId);
    if (!nodeData || nodeData.type !== "blocknote") return null;
    return parseStoredBlockNoteDocument(nodeData.values.doc) ?? null;
  },
});
