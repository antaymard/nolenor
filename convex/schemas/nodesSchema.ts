import { v } from "convex/values";
import { nodeTypeValidator } from "./nodeTypeSchema";

const nodesValidator = v.object({
  id: v.string(), // llmid
  nodeDataId: v.id("nodeDatas"),
  canvasId: v.id("canvases"),
  type: nodeTypeValidator,
  position: v.object({
    x: v.number(),
    y: v.number(),
  }),
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

export { nodesValidator };
