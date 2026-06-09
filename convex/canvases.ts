import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { optionalAuth, requireAuth, requireCanvasAccess } from "./lib/auth";
import * as CanvasModels from "./models/canvasModels";

export const getLastModified = query({
  args: {},
  returns: v.object({ success: v.boolean(), canvas: v.any() }),
  handler: async (ctx) => {
    const authUserId = await requireAuth(ctx);

    const canvas = await CanvasModels.getLastModifiedForUser(ctx, {
      authUserId,
    });

    return { success: true, canvas };
  },
});

export const listUserCanvases = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("canvases"),
      name: v.string(),
      shared: v.optional(v.boolean()),
      permission: v.optional(v.union(v.literal("viewer"), v.literal("editor"))),
    }),
  ),
  handler: async (ctx) => {
    const authUserId = await requireAuth(ctx);

    return await CanvasModels.listUserCanvasesWithShares(ctx, {
      authUserId,
    });
  },
});

export const readCanvas = query({
  args: {
    canvasId: v.id("canvases"),
  },
  returns: v.any(),
  handler: async (ctx, { canvasId }) => {
    const authUserId = await optionalAuth(ctx);
    const { permission } = await requireCanvasAccess(
      ctx,
      canvasId,
      authUserId,
      "viewer",
      { allowPublic: true },
    );

    const canvas = await CanvasModels.readCanvasById(ctx, { canvasId });

    return { ...canvas, _permission: permission };
  },
});

export const togglePublic = mutation({
  args: {
    canvasId: v.id("canvases"),
    isPublic: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, { canvasId, isPublic }) => {
    const authUserId = await requireAuth(ctx);
    await requireCanvasAccess(ctx, canvasId, authUserId, "owner");

    return await CanvasModels.setCanvasPublicState(ctx, {
      canvasId,
      isPublic,
    });
  },
});

export const createCanvas = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
  },
  returns: v.id("canvases"),
  handler: async (ctx, { name, description }) => {
    const authUserId = await requireAuth(ctx);

    return await CanvasModels.createCanvasForUser(ctx, {
      authUserId,
      name,
      description,
    });
  },
});

export const updateProps = mutation({
  args: {
    canvasId: v.id("canvases"),
    name: v.string(),
  },
  returns: v.id("canvases"),
  handler: async (ctx, args) => {
    const authUserId = await requireAuth(ctx);
    await requireCanvasAccess(ctx, args.canvasId, authUserId, "owner");

    return await CanvasModels.updateCanvasName(ctx, {
      canvasId: args.canvasId,
      name: args.name,
    });
  },
});

export const deleteCanvas = mutation({
  args: {
    canvasId: v.id("canvases"),
  },
  returns: v.id("canvases"),
  handler: async (ctx, { canvasId }) => {
    const authUserId = await requireAuth(ctx);
    await requireCanvasAccess(ctx, canvasId, authUserId, "owner");

    return await CanvasModels.deleteCanvasAndShares(ctx, {
      canvasId,
    });
  },
});
