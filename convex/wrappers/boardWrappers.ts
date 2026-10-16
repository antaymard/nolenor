import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import * as BoardModels from "../models/boardModels";
import { nodeDataVersionActorValidator } from "../schemas/nodeDataVersionsSchema";

export const create = internalMutation({
  args: {
    canvasId: v.id("canvases"),
    position: v.object({ x: v.number(), y: v.number() }),
    columns: v.number(),
    rows: v.number(),
    titles: v.optional(v.array(v.string())),
    color: v.optional(v.string()),
    actor: v.optional(nodeDataVersionActorValidator),
  },
  returns: v.object({
    boardId: v.string(),
    spaceIds: v.array(v.string()),
    titleNodeIds: v.array(v.string()),
  }),
  handler: async (ctx, args) => BoardModels.createBoard(ctx, args),
});

export const place = internalMutation({
  args: {
    canvasId: v.id("canvases"),
    boardId: v.string(),
    items: v.array(
      v.object({
        nodeId: v.string(),
        spaceId: v.string(),
        index: v.optional(v.number()),
      }),
    ),
  },
  returns: v.array(
    v.object({ nodeId: v.string(), spaceId: v.string(), index: v.number() }),
  ),
  handler: async (ctx, args) => BoardModels.placeNodesInBoard(ctx, args),
});

export const setGrid = internalMutation({
  args: {
    canvasId: v.id("canvases"),
    boardId: v.string(),
    columns: v.number(),
    rows: v.number(),
    actor: nodeDataVersionActorValidator,
  },
  returns: v.object({
    spaceIds: v.array(v.string()),
    removedSpaceIds: v.array(v.string()),
  }),
  handler: async (ctx, args) => BoardModels.setBoardGrid(ctx, args),
});
