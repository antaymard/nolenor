import { v } from "convex/values";
import { nodeTypeValidator } from "./nodeTypeSchema";

// ── Sub-validators ──────────────────────────────────────────────────────

const canvasNodesValidator = v.object({
  id: v.string(),
  nodeDataId: v.optional(v.id("nodeDatas")),
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

const edgesValidator = v.object({
  id: v.string(),
  source: v.string(),
  target: v.string(),

  sourceHandle: v.optional(v.string()),
  targetHandle: v.optional(v.string()),
  markerEnd: v.optional(v.any()),
  data: v.optional(v.record(v.string(), v.any())),
});

const slideshowsValidator = v.object({
  id: v.string(),
  name: v.string(),
  slides: v.optional(
    v.array(
      v.object({
        name: v.string(),
        viewport: v.any(),
      }),
    ),
  ),
});

const hotspotsValidator = v.object({
  id: v.string(),
  name: v.string(),
  description: v.optional(v.string()),
  color: v.optional(v.string()),
  viewport: v.any(),
});

// ── Main validator ──────────────────────────────────────────────────────

const canvasesValidator = v.object({
  creatorId: v.id("users"),
  name: v.string(),
  description: v.optional(v.string()),
  isPublic: v.optional(v.boolean()),
  // Provenance : posé sur les canvases semés à l'inscription (cf.
  // `STARTER_CANVAS_IDS`, convex/models/onboardingModels.ts), absent sur ceux
  // que l'utilisateur crée lui-même. Purement informatif — un canvas système
  // se modifie, se partage et se supprime comme n'importe quel autre.
  isSystem: v.optional(v.boolean()),

  nodes: v.optional(v.array(canvasNodesValidator)),
  edges: v.optional(v.array(edgesValidator)),

  slideshows: v.optional(v.array(slideshowsValidator)),

  hotspots: v.optional(v.array(hotspotsValidator)),

  updatedAt: v.number(),
});

export {
  canvasNodesValidator,
  edgesValidator,
  slideshowsValidator,
  hotspotsValidator,
  canvasesValidator,
};
