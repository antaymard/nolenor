import { v } from "convex/values";

export const canvasGraphMigrationPhaseValidator = v.union(
  v.literal("nodes"),
  v.literal("edges"),
  v.literal("verifyNodes"),
  v.literal("verifyEdges"),
  v.literal("certify"),
);

export const canvasGraphMigrationStatusValidator = v.union(
  v.literal("pending"),
  v.literal("running"),
  v.literal("blocked"),
  v.literal("certified"),
  v.literal("gone"),
);

// One durable work item per canvas. Indexes are integrated by schema.ts.
export const canvasGraphMigrationsValidator = v.object({
  canvasId: v.id("canvases"),
  revision: v.number(),
  phase: canvasGraphMigrationPhaseValidator,
  status: canvasGraphMigrationStatusValidator,
  offset: v.number(),
  cursor: v.union(v.string(), v.null()),
  verifiedNodes: v.number(),
  verifiedEdges: v.number(),
  revisionRestarts: v.number(),
  attempts: v.number(),
  inserts: v.number(),
  reconciles: v.number(),
  updatedAt: v.number(),
  certifiedAt: v.optional(v.number()),
  lastErrorId: v.optional(v.id("canvasGraphMigrationErrors")),
});

// Append-only: retrying a work item never erases its previous failures.
export const canvasGraphMigrationErrorsValidator = v.object({
  canvasId: v.id("canvases"),
  workId: v.optional(v.id("canvasGraphMigrations")),
  revision: v.number(),
  observedRevision: v.number(),
  phase: canvasGraphMigrationPhaseValidator,
  offset: v.number(),
  cursor: v.union(v.string(), v.null()),
  attempt: v.number(),
  message: v.string(),
});

export const canvasGraphMigrationControlValidator = v.object({
  name: v.literal("M1"),
  enabled: v.boolean(),
  updatedAt: v.number(),
});

export const canvasGraphMigrationResultValidator = v.object({
  canvasId: v.id("canvases"),
  status: v.union(canvasGraphMigrationStatusValidator, v.literal("paused")),
  phase: canvasGraphMigrationPhaseValidator,
  revision: v.number(),
  offset: v.number(),
  cursor: v.union(v.string(), v.null()),
  verifiedNodes: v.number(),
  verifiedEdges: v.number(),
  revisionRestarts: v.number(),
  inserts: v.number(),
  reconciles: v.number(),
  dryRun: v.boolean(),
  error: v.optional(v.string()),
});
