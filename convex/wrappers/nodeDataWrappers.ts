import { v, ConvexError, type Infer } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import { hasLiveDoc } from "../blocknoteSync";
import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { nodeTypeValidator } from "../schemas/nodeTypeSchema";
import {
  nodeDataVersionActorValidator,
  type NodeDataVersionActor,
} from "../schemas/nodeDataVersionsSchema";
import {
  threadNodeTouchKinds,
  type ThreadNodeTouchKind,
} from "../schemas/threadMetadataSchema";

import * as NodeDataModels from "../models/nodeDataModels";
import * as NodeModels from "../models/nodeModels";
import * as ThreadMetadataModels from "../models/threadMetadataModels";
import {
  type BlockNoteBlock,
  insertBlocks,
  replaceBlock,
  deleteBlocks,
  updateBlockProps,
  patchBlockText,
  normalizeReplaceDocumentBlocks,
  parseStoredBlockNoteDocument,
  stringifyBlockNoteDocumentForStorage,
  validateBlockNoteDocument,
  InvalidBlockNoteDocumentError,
} from "../lib/blockNoteDocument";
import {
  resolveBlockIdsIn,
  withBlockIdAliases,
} from "../lib/blockIdAliases";

/**
 * Rattache le node au thread qui vient de l'écrire, avec ce qui lui a été fait.
 *
 * Posé ici, au niveau des wrappers, et non dans `maybeCheckpoint` : celui-ci
 * coalesce les écritures d'un même acteur sur 15 minutes et n'insère alors
 * aucune version, ce qui laisserait le lien troué exactement là où l'agent
 * travaille le plus.
 *
 * Le verbe est passé par l'appelant parce que c'est lui qui le connaît — chaque
 * wrapper est déjà un chemin d'écriture distinct. Contrepartie : un wrapper
 * neuf qui oublie l'appel ne trace rien, en silence. C'est exactement ce qui
 * est arrivé à `appendImages`, arrivé de `master` avec un `actor` obligatoire
 * et aucun appel ici. Le garde-fou durable serait de porter la trace au point
 * de passage unique des écritures sur `nodeDatas` — il n'existe pas encore,
 * `appendImages` court-circuitant `updateValues` pour relire ses images dans la
 * transaction.
 *
 * Silencieux hors agent : une écriture humaine ne concerne aucun thread, et
 * une écriture MCP arrive sans `threadId` (cf. mcp/execute).
 */
async function trackAgentTouch(
  ctx: MutationCtx,
  {
    actor,
    nodeDataId,
    kind,
  }: {
    actor?: NodeDataVersionActor;
    nodeDataId: Id<"nodeDatas">;
    kind: ThreadNodeTouchKind;
  },
): Promise<void> {
  if (actor?.type !== "agent" || !actor.threadId) return;
  await ThreadMetadataModels.recordNodeTouch(ctx, {
    threadId: actor.threadId,
    nodeDataId,
    kind,
  });
}

export const create = internalMutation({
  args: {
    type: nodeTypeValidator,
    values: v.record(v.string(), v.any()),
    canvasId: v.id("canvases"),
    // Requis pour type === "custom" : lien autoritaire vers le template.
    templateId: v.optional(v.id("nodeTemplates")),
    // Sert uniquement à tracer le thread : une création n'a pas d'état
    // antérieur, donc pas de version à horodater. Sans lui, un thread qui
    // crée un node n'aurait aucun lien avec lui.
    actor: v.optional(nodeDataVersionActorValidator),
  },
  returns: v.id("nodeDatas"),
  handler: async (ctx, { actor, ...args }) => {
    const nodeDataId = await NodeDataModels.createNodeData(ctx, args);
    await trackAgentTouch(ctx, {
      actor,
      nodeDataId,
      kind: threadNodeTouchKinds.created,
    });
    return nodeDataId;
  },
});

export const updateValues = internalMutation({
  args: {
    _id: v.id("nodeDatas"),
    values: v.record(v.string(), v.any()),
    // Requis : impose à tous les call sites internes (tools agents) de
    // s'attribuer leurs écritures pour le versioning.
    actor: nodeDataVersionActorValidator,
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const updated = await NodeDataModels.updateValues(ctx, args);
    if ("text" in args.values || "level" in args.values) {
      await NodeModels.fitTitleNodesToText(ctx, { nodeDataId: args._id });
    }
    await trackAgentTouch(ctx, {
      actor: args.actor,
      nodeDataId: args._id,
      kind: threadNodeTouchKinds.updated,
    });
    return updated;
  },
});

/**
 * Écriture optimiste pour les tools table : ils lisent la table (query), la
 * transforment dans l'action puis la réécrivent en entier. Entre les deux, un
 * autre appel (tools lancés en parallèle par l'agent, édition utilisateur) a
 * pu modifier la table ; une écriture aveugle effacerait silencieusement ce
 * changement. On n'écrit donc que si la table est encore celle qui a été lue,
 * sinon on renvoie false et l'appelant recommence sur l'état frais.
 */
export const updateTableIfUnchanged = internalMutation({
  args: {
    _id: v.id("nodeDatas"),
    expectedTable: v.optional(v.any()),
    table: v.any(),
    actor: nodeDataVersionActorValidator,
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const existing = await ctx.db.get("nodeDatas", args._id);
    if (!existing) throw new ConvexError("NodeData not found");

    if (!isDeepEqual(existing.values?.table, args.expectedTable)) {
      return false;
    }

    await NodeDataModels.updateValues(ctx, {
      _id: args._id,
      values: { table: args.table },
      actor: args.actor,
    });
    await trackAgentTouch(ctx, {
      actor: args.actor,
      nodeDataId: args._id,
      kind: threadNodeTouchKinds.updated,
    });
    return true;
  },
});

// Égalité structurelle, indépendante de l'ordre des clés : la valeur relue en
// base n'a aucune garantie de conserver l'ordre de celle renvoyée par la query.
function isDeepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || !a || !b) {
    return false;
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return (
      a.length === b.length && a.every((item, i) => isDeepEqual(item, b[i]))
    );
  }
  const aRecord = a as Record<string, unknown>;
  const bRecord = b as Record<string, unknown>;
  const aKeys = Object.keys(aRecord);
  if (aKeys.length !== Object.keys(bRecord).length) return false;
  return aKeys.every(
    (key) =>
      Object.prototype.hasOwnProperty.call(bRecord, key) &&
      isDeepEqual(aRecord[key], bRecord[key]),
  );
}

export const deleteWithCascade = internalMutation({
  args: {
    nodeDataId: v.id("nodeDatas"),
    actor: v.optional(nodeDataVersionActorValidator),
    // Cf. `deleteNodeDataWithCascade` : emporte aussi l'historique du node.
    // Posé uniquement par la suppression de compte.
    purgeVersions: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Tracé avant la cascade : après, la ligne n'existe plus. Le lien lui
    // survit volontairement, comme les versions (corbeille de fait).
    await trackAgentTouch(ctx, {
      actor: args.actor,
      nodeDataId: args.nodeDataId,
      kind: threadNodeTouchKinds.deleted,
    });
    await NodeDataModels.deleteNodeDataWithCascade(ctx, args);
    return null;
  },
});

export const readNodeData = internalQuery({
  args: { _id: v.id("nodeDatas") },
  handler: async (ctx, args) => {
    return NodeDataModels.readNodeData(ctx, args);
  },
});

// ── BlockNote atomic edits ──────────────────────────────────────────────────
// All five specialized BlockNote tools (and the blocknote branch of
// set_node_data) go through this single mutation. Reading the current document,
// applying the structural operation, and writing it back happen inside one
// default-runtime Convex transaction, so concurrent edits compose or fail
// cleanly instead of overwriting each other from a stale snapshot.
//
// Only `doc` is written back: we never spread stale `nodeData.values`, which
// previously let a targeted edit clobber concurrent changes to other fields.
// The markdown <-> blocks conversion (jsdom) stays in the calling Node action;
// this mutation only manipulates the native block tree.
//
// Auth follows the same pattern as `updateValues`: no auth check inside the
// mutation. Access was already enforced at the `saveMessage` entrypoint
// (editor-level `requireCanvasAccess`). The tool does the node lookup via
// `getNodeWithNodeData` (same as the document tools) and passes `_id` here.

export const blockNoteEditValidator = v.union(
  v.object({
    kind: v.literal("insert"),
    position: v.union(
      v.literal("start"),
      v.literal("end"),
      v.literal("before"),
      v.literal("after"),
    ),
    referenceBlockId: v.optional(v.string()),
    // New blocks (no ids): the server assigns fresh ids to every block and
    // descendant, so the model cannot collide with existing identities.
    blocks: v.array(v.any()),
  }),
  v.object({
    kind: v.literal("replace"),
    blockId: v.string(),
    // Replacement block (no id): the server preserves the target id and gives
    // fresh ids to any descendants.
    block: v.any(),
  }),
  v.object({
    kind: v.literal("delete"),
    blockIds: v.array(v.string()),
  }),
  v.object({
    kind: v.literal("updateProps"),
    blockId: v.string(),
    propsPatch: v.record(v.string(), v.any()),
  }),
  v.object({
    kind: v.literal("patchText"),
    blockId: v.string(),
    oldString: v.string(),
    newString: v.string(),
  }),
  v.object({
    kind: v.literal("replaceDocument"),
    // Full replacement blocks; ids are optional. Unique supplied ids are
    // preserved, missing ids are generated, duplicates are rejected.
    blocks: v.array(v.any()),
  }),
);

type TargetedBlockNoteEdit = Exclude<
  Infer<typeof blockNoteEditValidator>,
  { kind: "replaceDocument" }
>;

/**
 * Apply a block-addressed edit with the agent's ids read as aliases (real ids
 * still accepted), filling `result` with the ids the agent will see next read.
 */
function applyTargetedEdit(
  current: BlockNoteBlock[],
  edit: TargetedBlockNoteEdit,
  result: {
    insertedBlockIds?: string[];
    affectedBlockId?: string;
    deletedCount?: number;
  },
): BlockNoteBlock[] {
  const { tree, insertedIds, aliasOf } = withBlockIdAliases(
    current,
    (blocks, resolve): { tree: BlockNoteBlock[]; insertedIds?: string[] } => {
      switch (edit.kind) {
        case "insert": {
          if (
            (edit.position === "before" || edit.position === "after") &&
            !edit.referenceBlockId
          ) {
            throw new ConvexError(
              "referenceBlockId is required when position is before/after.",
            );
          }
          const r = insertBlocks(
            blocks,
            edit.position,
            edit.referenceBlockId && resolve(edit.referenceBlockId),
            edit.blocks,
          );
          return { tree: r.tree, insertedIds: r.insertedIds };
        }
        case "replace":
          return {
            tree: replaceBlock(
              blocks,
              resolve(edit.blockId),
              resolveBlockIdsIn(edit.block, resolve),
            ),
          };
        case "delete": {
          const r = deleteBlocks(blocks, edit.blockIds.map(resolve));
          if (r.missing.length > 0) {
            throw new ConvexError(
              `Some block ids were not found: ${r.missing.join(", ")}. No deletion performed.`,
            );
          }
          result.deletedCount = edit.blockIds.length;
          return { tree: r.tree };
        }
        case "updateProps":
          return {
            tree: updateBlockProps(blocks, resolve(edit.blockId), edit.propsPatch),
          };
        case "patchText":
          return {
            tree: patchBlockText(
              blocks,
              resolve(edit.blockId),
              edit.oldString,
              edit.newString,
            ),
          };
      }
    },
  );
  if (insertedIds) result.insertedBlockIds = insertedIds.map(aliasOf);
  if (edit.kind !== "insert" && edit.kind !== "delete") {
    result.affectedBlockId = edit.blockId;
  }
  return tree;
}

export type BlockNoteEditResult = {
  insertedBlockIds?: string[];
  affectedBlockId?: string;
  deletedCount?: number;
};

export const blockNoteEditResultValidator = v.object({
  insertedBlockIds: v.optional(v.array(v.string())),
  affectedBlockId: v.optional(v.string()),
  deletedCount: v.optional(v.number()),
});

/**
 * L'arbre de blocs après `edit`, calculé sur `current` sans rien écrire.
 * Partagé avec l'édition du doc vivant (blocknoteLiveDoc.ts), qui le rejoue
 * sur la dernière version du doc collaboratif.
 */
export function computeBlockNoteEdit(
  current: BlockNoteBlock[],
  edit: Infer<typeof blockNoteEditValidator>,
  result: BlockNoteEditResult,
): unknown {
  // Full replacement: nothing to address, the ids are all fresh.
  // Targeted edits: the agent addresses blocks by the short aliases
  // read_nodes shows (see lib/blockIdAliases.ts), so the operation runs in
  // alias space — "block not found" hints list aliases too — and the real
  // ids are restored before storage.
  return edit.kind === "replaceDocument"
    ? normalizeReplaceDocumentBlocks(edit.blocks)
    : applyTargetedEdit(current, edit, result);
}

export const editBlockNoteDocument = internalMutation({
  args: {
    nodeDataId: v.id("nodeDatas"),
    edit: blockNoteEditValidator,
    actor: nodeDataVersionActorValidator,
  },
  returns: blockNoteEditResultValidator,
  // Type de retour explicite : `applyEdit` vit dans blocknoteLiveDoc.ts, qui
  // importe ce module (cycle de types par `internal`).
  handler: async (ctx, args): Promise<BlockNoteEditResult> => {
    const nodeData = await ctx.db.get(args.nodeDataId);
    if (!nodeData) {
      throw new ConvexError("Node data not found.");
    }
    if (nodeData.type !== "blocknote") {
      throw new ConvexError("Target node must be a blocknote node.");
    }

    // Ouvert en édition collaborative : l'édition se rejoue sur le doc
    // vivant, à sa dernière version, pour ne perdre aucune frappe pas encore
    // recopiée dans `values.doc` (cf. blocknoteLiveDoc.applyEdit).
    if (await hasLiveDoc(ctx, args.nodeDataId)) {
      const result: BlockNoteEditResult = await ctx.runMutation(
        internal.blocknoteLiveDoc.applyEdit,
        args,
      );
      await trackAgentTouch(ctx, {
        actor: args.actor,
        nodeDataId: args.nodeDataId,
        kind: threadNodeTouchKinds.updated,
      });
      return result;
    }

    // For replaceDocument, the current doc is irrelevant (full overwrite), so
    // a malformed stored document can be repaired. For targeted edits, a
    // malformed current document must be rejected — applying a structural
    // operation to a broken tree would be undefined.
    let current: BlockNoteBlock[];
    if (args.edit.kind === "replaceDocument") {
      current = [];
    } else {
      const parsed = parseStoredBlockNoteDocument(nodeData.values.doc);
      if (!parsed) {
        throw new ConvexError(
          "Cannot edit this blocknote node: the stored document is malformed. Use set_node_data with a full Markdown replacement to repair it.",
        );
      }
      // Beyond "is it parseable JSON", the document must also be a shape
      // BlockNote's real schema can construct — otherwise this edit would
      // compute successfully, pass `stringifyBlockNoteDocumentForStorage`'s
      // validation on the *edited* tree (which is the only gate that ran
      // before this check existed), and only crash client-side the next time
      // someone opens the node (see safeCreateEditor.ts / BlocknoteWindow.tsx
      // for why that no longer wipes the window, but it still shouldn't be
      // allowed to happen). Checking `current` here, before computing the
      // edit, also means an edit unrelated to the broken block gets this
      // same clear, actionable error instead of a confusing one surfacing
      // from deep inside the final serialization step below.
      try {
        validateBlockNoteDocument(parsed);
      } catch (error) {
        if (error instanceof InvalidBlockNoteDocumentError) {
          throw new ConvexError(
            `Cannot edit this blocknote node: the stored document contains invalid content (${error.message}). Use set_node_data with a full Markdown replacement to repair it.`,
          );
        }
        throw error;
      }
      current = parsed;
    }

    const result: BlockNoteEditResult = {};
    const tree = computeBlockNoteEdit(current, args.edit, result);

    const serialized = stringifyBlockNoteDocumentForStorage(tree);

    await NodeDataModels.updateValues(ctx, {
      _id: args.nodeDataId,
      values: { doc: serialized },
      actor: args.actor,
    });

    await trackAgentTouch(ctx, {
      actor: args.actor,
      nodeDataId: args.nodeDataId,
      kind: threadNodeTouchKinds.updated,
    });

    return result;
  },
});

/**
 * Append d'images généré côté serveur. Le tableau existant est relu DANS la
 * transaction, pour ne pas écraser un upload concurrent (cf. appendImages).
 */
export const appendImages = internalMutation({
  args: {
    nodeDataId: v.id("nodeDatas"),
    images: v.array(
      v.object({
        url: v.string(),
        filename: v.optional(v.string()),
        mimeType: v.optional(v.string()),
        size: v.optional(v.number()),
        uploadedAt: v.optional(v.number()),
        key: v.optional(v.string()),
      }),
    ),
    actor: nodeDataVersionActorValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await NodeDataModels.appendImages(ctx, args);
    await trackAgentTouch(ctx, {
      actor: args.actor,
      nodeDataId: args.nodeDataId,
      kind: threadNodeTouchKinds.updated,
    });
    return null;
  },
});

/** Statut de génération d'images (hors `values`, cf. setImageGeneration). */
export const setImageGeneration = internalMutation({
  args: {
    nodeDataId: v.id("nodeDatas"),
    status: v.union(v.literal("running"), v.literal("error")),
    error: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await NodeDataModels.setImageGeneration(ctx, args);
    return null;
  },
});
