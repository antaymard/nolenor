import { internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { readCanvasById } from "../models/canvasModels";

export const read = internalQuery({
  args: {
    canvasId: v.id("canvases"),
  },
  handler: async (ctx, args) => {
    return await readCanvasById(ctx, { canvasId: args.canvasId });
  },
});

export const listUserCanvases = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, { userId }) => {
    const canvases = await ctx.db
      .query("canvases")
      .withIndex("by_creator", (q) => q.eq("creatorId", userId))
      .collect();

    // Only returns basic infos
    return canvases.map((i) => ({
      _id: i._id,
      name: i.name,
      createdAt: i._creationTime,
      description: i.description,
    }));
  },
});

export const checkCanvasAccessForUser = internalQuery({
  args: {
    canvasId: v.id("canvases"),
    userId: v.id("users"),
  },
  handler: async (ctx, { canvasId, userId }) => {
    // Only for now, we only check if the user is the creator
    const canvas = await ctx.db.get(canvasId);
    if (!canvas) return false;
    return canvas.creatorId === userId;
  },
});
