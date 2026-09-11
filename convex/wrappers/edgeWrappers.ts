import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import * as EdgeModels from "../models/edgeModels";
import {
  edgeCreateItemValidator,
  edgePatchUpdateValidator,
  edgesValidator,
} from "../schemas/edgesSchema";

export const create = internalMutation({
  args: {
    edges: v.array(edgeCreateItemValidator),
    touchCanvas: v.optional(v.boolean()),
  },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    return EdgeModels.createEdges(ctx, {
      edges: args.edges,
      touchCanvas: args.touchCanvas,
    });
  },
});

export const patch = internalMutation({
  args: {
    updates: v.array(edgePatchUpdateValidator),
    touchCanvas: v.optional(v.boolean()),
  },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    return EdgeModels.patchEdges(ctx, {
      updates: args.updates,
      touchCanvas: args.touchCanvas,
    });
  },
});

export const trash = internalMutation({
  args: {
    edgeIds: v.array(v.string()),
  },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    return EdgeModels.trashEdges(ctx, { edgeIds: args.edgeIds });
  },
});

const edgeDocValidator = v.object({
  _id: v.id("edges"),
  _creationTime: v.number(),
  ...edgesValidator.fields,
});

export const listFromCanvas = internalQuery({
  args: {
    canvasId: v.id("canvases"),
  },
  returns: v.array(edgeDocValidator),
  handler: async (ctx, args) => {
    return EdgeModels.listFromCanvas(ctx, { canvasId: args.canvasId });
  },
});

export const read = internalQuery({
  args: {
    edgeId: v.string(),
  },
  handler: async (ctx, args) => {
    return EdgeModels.getEdgeOrThrow(ctx, { edgeId: args.edgeId });
  },
});
