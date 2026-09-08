import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { nodeDataVersionActorValidator } from "./schemas/nodeDataVersionsSchema";
import { deleteNodeDataWithCascade } from "./models/nodeDataModels";

// One table per transaction: even 1 MiB legacy documents leave read/write
// headroom. Content is checkpointed one at a time; R2 keys have a second lookup
// and enter scheduler arguments, so only one reference is released per pass.
export const CLEANUP_BATCH_SIZE = 8;

export const purgeCanvas = internalMutation({
  args: {
    canvasId: v.id("canvases"),
    actor: v.optional(nodeDataVersionActorValidator),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    // A never soft-deletes. A mis-scheduled purge cannot touch a living graph.
    if (await ctx.db.get("canvases", args.canvasId)) return null;

    const nodeData = await ctx.db
      .query("nodeDatas")
      .withIndex("by_canvasId", (q) => q.eq("canvasId", args.canvasId))
      .first();
    if (nodeData) {
      await deleteNodeDataWithCascade(ctx, {
        nodeDataId: nodeData._id,
        canvasId: args.canvasId,
        actor: args.actor,
      });
      await ctx.scheduler.runAfter(
        0,
        internal.canvasGraphCleanup.purgeCanvas,
        args,
      );
      return null;
    }

    // Delete placements, never their references: a corrupt foreign nodeDataId
    // in a deleted graph must not destroy content owned by another canvas.
    const nodes = await ctx.db
      .query("nodes")
      .withIndex("by_canvasId", (q) => q.eq("canvasId", args.canvasId))
      .take(CLEANUP_BATCH_SIZE);
    if (nodes.length > 0) {
      for (const node of nodes) await ctx.db.delete("nodes", node._id);
      await ctx.scheduler.runAfter(
        0,
        internal.canvasGraphCleanup.purgeCanvas,
        args,
      );
      return null;
    }

    const edges = await ctx.db
      .query("edges")
      .withIndex("by_canvasId", (q) => q.eq("canvasId", args.canvasId))
      .take(CLEANUP_BATCH_SIZE);
    if (edges.length > 0) {
      for (const edge of edges) await ctx.db.delete("edges", edge._id);
      await ctx.scheduler.runAfter(
        0,
        internal.canvasGraphCleanup.purgeCanvas,
        args,
      );
      return null;
    }

    const shares = await ctx.db
      .query("shares")
      .withIndex("by_canvas", (q) => q.eq("canvasId", args.canvasId))
      .take(CLEANUP_BATCH_SIZE);
    if (shares.length > 0) {
      for (const share of shares) await ctx.db.delete("shares", share._id);
      await ctx.scheduler.runAfter(
        0,
        internal.canvasGraphCleanup.purgeCanvas,
        args,
      );
      return null;
    }

    // Also cover stale chunks whose nodeData had already disappeared.
    const chunks = await ctx.db
      .query("searchableChunks")
      .withIndex("by_canvasId", (q) => q.eq("canvasId", args.canvasId))
      .take(CLEANUP_BATCH_SIZE);
    if (chunks.length > 0) {
      for (const chunk of chunks)
        await ctx.db.delete("searchableChunks", chunk._id);
      await ctx.scheduler.runAfter(
        0,
        internal.canvasGraphCleanup.purgeCanvas,
        args,
      );
      return null;
    }

    const memories = await ctx.db
      .query("memories")
      .withIndex("by_subject_and_type", (q) => q.eq("subjectId", args.canvasId))
      .take(CLEANUP_BATCH_SIZE);
    for (const memory of memories) await ctx.db.delete("memories", memory._id);
    if (memories.length > 0) {
      await ctx.scheduler.runAfter(
        0,
        internal.canvasGraphCleanup.purgeCanvas,
        args,
      );
    }
    return null;
  },
});

export const purgeNodeData = internalMutation({
  args: { nodeDataId: v.id("nodeDatas") },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    if (await ctx.db.get("nodeDatas", args.nodeDataId)) return null;

    // Each deleted row is its own durable progress marker. Restarting from the
    // index head tolerates duplicate jobs and requires no giant ID snapshot.
    const memories = await ctx.db
      .query("memories")
      .withIndex("by_subject_and_type", (q) =>
        q.eq("subjectId", args.nodeDataId),
      )
      .take(CLEANUP_BATCH_SIZE);
    if (memories.length > 0) {
      for (const memory of memories)
        await ctx.db.delete("memories", memory._id);
      await ctx.scheduler.runAfter(
        0,
        internal.canvasGraphCleanup.purgeNodeData,
        args,
      );
      return null;
    }

    const chunks = await ctx.db
      .query("searchableChunks")
      .withIndex("by_nodeDataId", (q) => q.eq("nodeDataId", args.nodeDataId))
      .take(CLEANUP_BATCH_SIZE);
    if (chunks.length > 0) {
      for (const chunk of chunks)
        await ctx.db.delete("searchableChunks", chunk._id);
      await ctx.scheduler.runAfter(
        0,
        internal.canvasGraphCleanup.purgeNodeData,
        args,
      );
      return null;
    }

    const jobs = await ctx.db
      .query("scheduledJobs")
      .withIndex("by_nodeDataId", (q) => q.eq("nodesDataId", args.nodeDataId))
      .take(CLEANUP_BATCH_SIZE);
    if (jobs.length > 0) {
      for (const job of jobs) {
        const scheduled = await ctx.db.system.get(job.jobId);
        if (scheduled?.state.kind === "pending")
          await ctx.scheduler.cancel(job.jobId);
        await ctx.db.delete("scheduledJobs", job._id);
      }
      await ctx.scheduler.runAfter(
        0,
        internal.canvasGraphCleanup.purgeNodeData,
        args,
      );
      return null;
    }

    const ref = await ctx.db
      .query("r2Objects")
      .withIndex("by_nodeDataId", (q) => q.eq("nodeDataId", args.nodeDataId))
      .first();
    if (ref) {
      await ctx.db.delete("r2Objects", ref._id);
      const remaining = await ctx.db
        .query("r2Objects")
        .withIndex("by_key", (q) => q.eq("key", ref.key))
        .first();
      if (!remaining) {
        await ctx.scheduler.runAfter(0, internal.uploads.deleteR2Files, {
          keys: [ref.key],
        });
      }
      await ctx.scheduler.runAfter(
        0,
        internal.canvasGraphCleanup.purgeNodeData,
        args,
      );
    }
    // Versions and thread traces intentionally survive, as before.
    return null;
  },
});
