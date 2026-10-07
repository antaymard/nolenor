import { ConvexError, v } from "convex/values";
import { ProsemirrorSync } from "@convex-dev/prosemirror-sync";
import { components, internal } from "./_generated/api";
import {
  internalQuery,
  mutation,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import type { DataModel, Id } from "./_generated/dataModel";
import { optionalAuth, requireAuth, requireCanvasAccess } from "./lib/auth";
import errors from "./config/errorsConfig";
import { Debouncer } from "./lib/debouncer";
import { parseStoredBlockNoteDocument } from "./lib/blockNoteDocument";

// Édition collaborative des nodes blocknote (SPIKE).
//
// Le doc vivant est un doc ProseMirror du composant `prosemirror-sync`, dont
// l'id est celui du nodeData. Les éditeurs ouverts s'échangent des steps (OT),
// le composant tient snapshots et historique.
//
// `values.doc` reste la forme lue par TOUT le reste de l'app (vue canvas,
// recherche, versions, export, tools de l'agent). Il en devient une copie,
// tenue à jour par le serveur seul :
//   - éditeurs → `values.doc` : chaque lot de steps accepté planifie une
//     recopie regroupée (`blocknoteMaterialize.ts`), qui reconstruit le doc
//     à sa dernière version et l'écrit. Un éditeur fermé juste après sa
//     dernière frappe est donc couvert, snapshot envoyé ou non ;
//   - autre écriture → doc vivant : toute écriture du `doc` hors de ce chemin
//     (agent, restore, MCP) est poussée dans le doc vivant par
//     `blocknoteSyncNode.pushDocToSync` (cf. NodeDataModel.updateValues).
//
// Un doc vivant naît à la première ouverture en sync, depuis `values.doc`
// (`create` côté client).

export const prosemirrorSync = new ProsemirrorSync<Id<"nodeDatas">>(
  components.prosemirrorSync,
);

/**
 * Regroupe les recopies d'un même node : 5 s après la dernière frappe, et au
 * plus 30 s après la première, pour qu'une frappe continue finisse quand
 * même par apparaître dans le canvas, la recherche et les tools de l'agent.
 * Chaque recopie réindexe le node et peut créer un point de restauration.
 */
const materializeDebouncer = new Debouncer(
  components.debouncer,
  internal.blocknoteMaterialize.materializeLatest,
  { delay: 5_000, maxWait: 30_000 },
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

export const { getSnapshot, submitSnapshot, latestVersion, getSteps } =
  prosemirrorSync.syncApi<DataModel>({
  checkRead: async (ctx, id) => {
    await requireBlocknoteAccess(ctx, id, "viewer");
  },
  checkWrite: async (ctx, id) => {
    await requireBlocknoteAccess(ctx, id, "editor");
  },
});

/**
 * Le `submitSteps` du composant, plus la recopie regroupée dans `values.doc`
 * quand les steps sont acceptés. Même nom et même contrat que celui de
 * `syncApi`, que le hook client appelle par `api.blocknoteSync.submitSteps`.
 */
export const submitSteps = mutation({
  args: {
    id: v.string(),
    version: v.number(),
    clientId: v.union(v.string(), v.number()),
    steps: v.array(v.string()),
  },
  returns: v.union(
    v.object({
      status: v.literal("needs-rebase"),
      clientIds: v.array(v.union(v.string(), v.number())),
      steps: v.array(v.string()),
    }),
    v.object({ status: v.literal("synced") }),
  ),
  handler: async (ctx, args) => {
    const { nodeData, userId } = await requireBlocknoteAccess(
      ctx,
      args.id,
      "editor",
    );
    const result = await ctx.runMutation(
      components.prosemirrorSync.lib.submitSteps,
      args,
    );
    if (result.status === "synced") {
      await materializeDebouncer.schedule(ctx, nodeData._id, {
        nodeDataId: nodeData._id,
        userId: userId as Id<"users">,
      });
    }
    return result;
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
