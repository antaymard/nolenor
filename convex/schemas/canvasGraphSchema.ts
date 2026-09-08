import { v } from "convex/values";
import { nodeTypeValidator } from "./nodeTypeSchema";

export const graphNodeValidator = v.object({
  canvasId: v.id("canvases"),
  nodeId: v.string(),
  nodeDataId: v.optional(v.id("nodeDatas")),
  type: nodeTypeValidator,
  position: v.object({ x: v.number(), y: v.number() }),
  width: v.number(),
  height: v.number(),
  locked: v.optional(v.boolean()),
  hidden: v.optional(v.boolean()),
  zIndex: v.optional(v.number()),
  color: v.optional(v.string()),
  variant: v.optional(v.string()),
  parentId: v.optional(v.string()),
  extent: v.optional(
    v.union(v.literal("parent"), v.array(v.array(v.number()))),
  ),
  extendParent: v.optional(v.boolean()),
  data: v.optional(v.record(v.string(), v.any())),
});

export const graphEdgeValidator = v.object({
  canvasId: v.id("canvases"),
  edgeId: v.string(),
  source: v.string(),
  target: v.string(),
  sourceHandle: v.optional(v.string()),
  targetHandle: v.optional(v.string()),
  markerEnd: v.optional(v.any()),
  data: v.optional(v.record(v.string(), v.any())),
});
