import { v, ConvexError } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import { nodeTypeValidator } from "../schemas/nodeTypeSchema";
import { nodeDataVersionActorValidator } from "../schemas/nodeDataVersionsSchema";

import * as NodeDataModels from "../models/nodeDataModels";
import * as CanvasNodeModels from "../models/canvasNodeModels";
import { requireAuth, requireCanvasAccess } from "../lib/auth";
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
} from "../lib/blockNoteDocument";

export const create = internalMutation({
  args: {
    type: nodeTypeValidator,
    values: v.record(v.string(), v.any()),
    canvasId: v.id("canvases"),
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
    canvasId: v.id("canvases"),
    nodeId: v.string(),
    // Agent thread id, recorded on the version checkpoint for traceability.
    threadId: v.optional(v.string()),
    edit: blockNoteEditValidator,
  },
  returns: v.object({
    insertedBlockIds: v.optional(v.array(v.string())),
    affectedBlockId: v.optional(v.string()),
    deletedCount: v.optional(v.number()),
  }),
  handler: async (ctx, args) => {
    // Authorization is derived server-side (never from an argument) and required
    // at editor level: every BlockNote tool is a write.
    const userId = await requireAuth(ctx);
    await requireCanvasAccess(ctx, args.canvasId, userId, "editor");

    const { node, nodeData } = await CanvasNodeModels.getNodeWithNodeData(ctx, {
      canvasId: args.canvasId,
      nodeId: args.nodeId,
    });
    if (node.type !== "blocknote" || nodeData.type !== "blocknote") {
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
          "Cannot edit this blocknote node: the stored document is malformed. Use set_node_data with a full BlockNote XML v1 replacement to repair it.",
        );
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
      _id: nodeData._id,
      values: { doc: serialized },
      actor: { type: "agent", userId, threadId: args.threadId },
    });

    return result;
  },
});
