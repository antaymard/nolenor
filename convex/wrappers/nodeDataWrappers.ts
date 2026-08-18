import { v, ConvexError } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import { nodeTypeValidator } from "../schemas/nodeTypeSchema";
import { nodeDataVersionActorValidator } from "../schemas/nodeDataVersionsSchema";

import * as NodeDataModels from "../models/nodeDataModels";
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

export const create = internalMutation({
  args: {
    type: nodeTypeValidator,
    values: v.record(v.string(), v.any()),
    canvasId: v.id("canvases"),
    // Requis pour type === "custom" : lien autoritaire vers le template.
    templateId: v.optional(v.id("nodeTemplates")),
  },
  returns: v.id("nodeDatas"),
  handler: async (ctx, args) => {
    return NodeDataModels.createNodeData(ctx, args);
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
    return NodeDataModels.updateValues(ctx, args);
  },
});

export const deleteWithCascade = internalMutation({
  args: {
    nodeDataId: v.id("nodeDatas"),
    actor: v.optional(nodeDataVersionActorValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
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

const blockNoteEditValidator = v.union(
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

export const editBlockNoteDocument = internalMutation({
  args: {
    nodeDataId: v.id("nodeDatas"),
    edit: blockNoteEditValidator,
    actor: nodeDataVersionActorValidator,
  },
  returns: v.object({
    insertedBlockIds: v.optional(v.array(v.string())),
    affectedBlockId: v.optional(v.string()),
    deletedCount: v.optional(v.number()),
  }),
  handler: async (ctx, args) => {
    const nodeData = await ctx.db.get(args.nodeDataId);
    if (!nodeData) {
      throw new ConvexError("Node data not found.");
    }
    if (nodeData.type !== "blocknote") {
      throw new ConvexError("Target node must be a blocknote node.");
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

    let tree: unknown;
    const result: {
      insertedBlockIds?: string[];
      affectedBlockId?: string;
      deletedCount?: number;
    } = {};

    switch (args.edit.kind) {
      case "insert": {
        if (
          (args.edit.position === "before" || args.edit.position === "after") &&
          !args.edit.referenceBlockId
        ) {
          throw new ConvexError(
            "referenceBlockId is required when position is before/after.",
          );
        }
        const r = insertBlocks(
          current,
          args.edit.position,
          args.edit.referenceBlockId,
          args.edit.blocks,
        );
        tree = r.tree;
        result.insertedBlockIds = r.insertedIds;
        break;
      }
      case "replace": {
        tree = replaceBlock(current, args.edit.blockId, args.edit.block);
        result.affectedBlockId = args.edit.blockId;
        break;
      }
      case "delete": {
        const r = deleteBlocks(current, args.edit.blockIds);
        if (r.missing.length > 0) {
          throw new ConvexError(
            `Some block ids were not found: ${r.missing.join(", ")}. No deletion performed.`,
          );
        }
        tree = r.tree;
        result.deletedCount = args.edit.blockIds.length;
        break;
      }
      case "updateProps": {
        tree = updateBlockProps(current, args.edit.blockId, args.edit.propsPatch);
        result.affectedBlockId = args.edit.blockId;
        break;
      }
      case "patchText": {
        tree = patchBlockText(
          current,
          args.edit.blockId,
          args.edit.oldString,
          args.edit.newString,
        );
        result.affectedBlockId = args.edit.blockId;
        break;
      }
      case "replaceDocument": {
        tree = normalizeReplaceDocumentBlocks(args.edit.blocks);
        break;
      }
    }

    const serialized = stringifyBlockNoteDocumentForStorage(tree);

    await NodeDataModels.updateValues(ctx, {
      _id: args.nodeDataId,
      values: { doc: serialized },
      actor: args.actor,
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
