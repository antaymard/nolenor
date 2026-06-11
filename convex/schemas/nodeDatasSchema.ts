import { v } from "convex/values";
import { nodeTypeValidator } from "./nodeTypeSchema";

// ── Main validator ──────────────────────────────────────────────────────

const nodeDatasValidator = v.object({
  canvasId: v.id("canvases"),
  type: nodeTypeValidator,
  updatedAt: v.number(),
  removedFromCanvasAt: v.optional(v.number()),
  values: v.record(v.string(), v.any()),
});

export { nodeDatasValidator };
