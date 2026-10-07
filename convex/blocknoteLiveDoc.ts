import { v } from "convex/values";
import * as BlockNoteCore from "@blocknote/core";
import type { Node as PmNode } from "@tiptap/pm/model";
import { internalMutation, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  blocksToProsemirrorDoc,
  createServerBlockNoteSchema,
  replaceChangedBlocks,
} from "./lib/blockNoteServerSchema";
import {
  parseStoredBlockNoteDocument,
  stringifyBlockNoteDocumentForStorage,
  type BlockNoteBlock,
} from "./lib/blockNoteDocument";
import * as NodeDataModel from "./models/nodeDataModels";
import * as NodeModels from "./models/nodeModels";
import { nodeDataVersionActorValidator } from "./schemas/nodeDataVersionsSchema";
import {
  blockNoteEditResultValidator,
  blockNoteEditValidator,
  computeBlockNoteEdit,
  type BlockNoteEditResult,
} from "./wrappers/nodeDataWrappers";
import {
  hasLiveDoc,
  materializeDebouncer,
  prosemirrorSync,
} from "./blocknoteSync";

// Le côté serveur du doc vivant d'un blocknote synchronisé (cf.
// blocknoteSync.ts) : tout ce qui convertit entre doc ProseMirror et blocs,
// dans le runtime V8.
//
// `@blocknote/core` est importé normalement : cette conversion ne touche pas
// au DOM (cf. lib/blockNoteServerSchema.test.ts, en environnement Node pur).
// Module à part pour que seules ces fonctions chargent BlockNote : les
// fonctions de sync, appelées à chaque frappe, n'en paient pas l'import —
// les autres modules n'y entrent que par `internal` ou `ctx.runMutation`.

// Une construction par isolate : le schéma ne dépend que des configs.
let editor: ReturnType<typeof createEditor> | null = null;
function createEditor() {
  return BlockNoteCore.BlockNoteEditor.create({
    schema: createServerBlockNoteSchema(BlockNoteCore),
    _headless: true,
  });
}
function getEditor() {
  editor ??= createEditor();
  return editor;
}

function toBlocks(doc: PmNode): BlockNoteBlock[] {
  const { pmSchema } = getEditor();
  const blocks: BlockNoteBlock[] = [];
  doc.firstChild?.forEach((node) => {
    blocks.push(BlockNoteCore.nodeToBlock(node, pmSchema) as BlockNoteBlock);
  });
  return blocks;
}

/**
 * Écrit `doc` (un état du doc vivant) dans `values.doc` s'il en diffère,
 * comparé sous sa forme stockée : `updateValues` ne détecte un no-op que par
 * `Object.is`, et des blocs ne valent jamais la chaîne stockée.
 */
async function writeCopy(
  ctx: MutationCtx,
  nodeDataId: Id<"nodeDatas">,
  doc: PmNode,
  actor: Parameters<typeof NodeDataModel.updateValues>[1]["actor"],
) {
  const nodeData = await ctx.db.get(nodeDataId);
  if (!nodeData || nodeData.type !== "blocknote") return;
  const stored = stringifyBlockNoteDocumentForStorage(toBlocks(doc));
  if (stored === nodeData.values.doc) return;
  await NodeDataModel.updateValues(ctx, {
    _id: nodeDataId,
    values: { doc: stored },
    actor,
    fromSync: true,
  });
}

/** Recopie le doc vivant, à sa dernière version, dans `values.doc`. */
async function copyLatest(
  ctx: MutationCtx,
  nodeDataId: Id<"nodeDatas">,
  userId: Id<"users">,
) {
  if (!(await hasLiveDoc(ctx, nodeDataId))) return;
  const { doc } = await prosemirrorSync.getDoc(
    ctx,
    nodeDataId,
    getEditor().pmSchema,
  );
  await writeCopy(ctx, nodeDataId, doc, { type: "user", userId });
}

/**
 * Fait ICI la recopie regroupée en attente, s'il y en a une, au lieu
 * d'attendre son échéance. Avant une écriture de l'agent ou du système :
 * leur point de restauration doit contenir les dernières frappes, attribuées
 * à leur auteur. Avant une lecture de l'agent : il doit lire ce qui est tapé.
 */
async function catchUpLiveCopy(
  ctx: MutationCtx,
  nodeDataId: Id<"nodeDatas">,
) {
  const pending = await materializeDebouncer.take(ctx, nodeDataId);
  if (pending) await copyLatest(ctx, pending.nodeDataId, pending.userId);
}

/**
 * La recopie regroupée planifiée par `blocknoteSync.submitSteps`. `userId` :
 * l'auteur des derniers steps de la fenêtre (les args du dernier appel
 * gagnent), à qui le point de restauration est attribué.
 */
export const materializeLatest = internalMutation({
  args: { nodeDataId: v.id("nodeDatas"), userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, { nodeDataId, userId }) => {
    await copyLatest(ctx, nodeDataId, userId);
    return null;
  },
});

/** Rattrapage avant une écriture du `doc` hors sync (cf. updateValues). */
export const catchUp = internalMutation({
  args: { nodeDataId: v.id("nodeDatas") },
  returns: v.null(),
  handler: async (ctx, { nodeDataId }) => {
    await catchUpLiveCopy(ctx, nodeDataId);
    return null;
  },
});

/**
 * Rattrapage avant une lecture de l'agent (read_nodes) : les nodes d'un
 * canvas, par leur id de canvas. Ignore ce qui n'est pas un blocknote.
 */
export const catchUpCanvasNodes = internalMutation({
  args: { canvasId: v.id("canvases"), nodeIds: v.array(v.string()) },
  returns: v.null(),
  handler: async (ctx, { canvasId, nodeIds }) => {
    for (const nodeId of nodeIds) {
      const node = await NodeModels.getNodeByLlmId(ctx, { nodeId });
      if (!node || node.canvasId !== canvasId || node.type !== "blocknote") {
        continue;
      }
      await catchUpLiveCopy(ctx, node.nodeDataId);
    }
    return null;
  },
});

/**
 * Une édition de l'agent (tools blocs, MCP) sur un blocknote synchronisé.
 *
 * Rejouée par `transform` sur la dernière version du doc vivant : si des
 * steps arrivent entre la lecture et l'écriture, `transform` relance
 * l'édition sur le doc à jour, et une frappe concurrente n'est jamais
 * écrasée. Seuls les blocs modifiés sont remplacés. Le résultat est recopié
 * aussitôt, au nom de l'agent : son point de restauration contient l'état
 * juste avant lui.
 */
export const applyEdit = internalMutation({
  args: {
    nodeDataId: v.id("nodeDatas"),
    edit: blockNoteEditValidator,
    actor: nodeDataVersionActorValidator,
  },
  returns: blockNoteEditResultValidator,
  handler: async (ctx, { nodeDataId, edit, actor }) => {
    await catchUpLiveCopy(ctx, nodeDataId);

    const { pmSchema } = getEditor();
    let result: BlockNoteEditResult = {};
    const doc = await prosemirrorSync.transform(
      ctx,
      nodeDataId,
      pmSchema,
      (current) => {
        // Rejouable : `transform` peut rappeler cette fonction sur un doc
        // plus récent.
        result = {};
        const tree = computeBlockNoteEdit(toBlocks(current), edit, result);
        // Même canonicalisation et même validation qu'une écriture stockée.
        const next = parseStoredBlockNoteDocument(
          stringifyBlockNoteDocumentForStorage(tree),
        );
        return replaceChangedBlocks(
          current,
          blocksToProsemirrorDoc(BlockNoteCore, getEditor(), next ?? []),
        );
      },
    );
    await writeCopy(ctx, nodeDataId, doc, actor);
    return result;
  },
});

/**
 * Pousse `values.doc`, qui vient d'être écrit hors sync (restore,
 * set_node_data, MCP, ancienne window), dans le doc vivant. Appelé par
 * `updateValues` dans la même transaction, après son écriture.
 */
export const pushStoredDoc = internalMutation({
  args: { nodeDataId: v.id("nodeDatas") },
  returns: v.null(),
  handler: async (ctx, { nodeDataId }) => {
    const nodeData = await ctx.db.get(nodeDataId);
    if (!nodeData || nodeData.type !== "blocknote") return null;
    const blocks = parseStoredBlockNoteDocument(nodeData.values.doc) ?? [];
    const next = blocksToProsemirrorDoc(BlockNoteCore, getEditor(), blocks);
    await prosemirrorSync.transform(
      ctx,
      nodeDataId,
      getEditor().pmSchema,
      (current) => replaceChangedBlocks(current, next),
    );
    return null;
  },
});
