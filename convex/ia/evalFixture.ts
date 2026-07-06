import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { createCanvasForUser } from "../models/canvasModels";

// One dedicated canvas, reused across eval runs, so dataset cases in evals/
// can reference stable node ids. The two content nodes (a document, a table)
// are seeded manually once (see evals/README.md) rather than scripted here:
// reproducing create_node/table_update_schema's storage-format invariants in
// a seed mutation would risk drifting from what those tools actually write.
export const FIXTURE_CANVAS_NAME = "Braintrust Eval Fixture";

export const ensureFixtureCanvas = internalMutation({
  args: { userId: v.id("users") },
  returns: v.object({ canvasId: v.id("canvases"), created: v.boolean() }),
  handler: async (ctx, { userId }) => {
    const existing = await ctx.db
      .query("canvases")
      .withIndex("by_creator", (q) => q.eq("creatorId", userId))
      .collect();
    const fixture = existing.find((c) => c.name === FIXTURE_CANVAS_NAME);
    if (fixture) {
      return { canvasId: fixture._id, created: false };
    }

    const canvasId = await createCanvasForUser(ctx, {
      authUserId: userId,
      name: FIXTURE_CANVAS_NAME,
      description:
        "Seeded fixture for Braintrust offline evals of Nolë. Do not delete.",
    });
    return { canvasId, created: true };
  },
});
