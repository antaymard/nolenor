import { v } from "convex/values";

const edgesValidator = v.object({
  id: v.string(), // llmid
  source: v.string(),
  target: v.string(),
  canvasId: v.id("canvases"),
  sourceHandle: v.optional(v.string()),
  targetHandle: v.optional(v.string()),
  markerEnd: v.optional(v.any()),
  data: v.optional(v.record(v.string(), v.any())),
});

export { edgesValidator };
