import { v } from "convex/values";
import { nodeTypeValidator } from "./nodeTypeSchema";

// ── Main validator ──────────────────────────────────────────────────────

const nodeDatasValidator = v.object({
  canvasId: v.id("canvases"),
  type: nodeTypeValidator,
  updatedAt: v.number(),
  removedFromCanvasAt: v.optional(v.number()),
  values: v.record(v.string(), v.any()),

  // TO DEP
  status: v.optional(v.any()),
  automationProgress: v.optional(v.any()),

  agent: v.optional(v.any()),
  dataProcessing: v.optional(v.any()),
  automationMode: v.optional(v.any()),
  dependencies: v.optional(v.any()),
});

export { nodeDatasValidator };
