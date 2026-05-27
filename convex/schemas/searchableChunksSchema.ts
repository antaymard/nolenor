import { v } from "convex/values";
import { nodeTypeValidator } from "./nodeTypeSchema";

// ── Sub-validators ──────────────────────────────────────────────────────

const chunkTypeValidator = v.union(
  v.literal("node"),
  v.literal("page"),
  v.literal("annotation"),
);

// ── Main validator ──────────────────────────────────────────────────────

const searchableChunksValidator = v.object({
  nodeId: v.string(),
  nodeDataId: v.id("nodeDatas"),
  canvasId: v.id("canvases"),
  chunkType: chunkTypeValidator,
  nodeType: nodeTypeValidator,
  templateId: v.optional(v.string()),
  title: v.optional(v.string()),
  text: v.string(),
  order: v.number(),
  metadata: v.optional(v.record(v.string(), v.any())),
});

export { searchableChunksValidator, chunkTypeValidator };
