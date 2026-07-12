import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireAuth } from "./lib/auth";

export const listNodeDataMemories = query({
  args: {
    nodeDataId: v.id("nodeDatas"),
  },
  returns: v.any(),
  handler: async (ctx, _args) => {
    const authUserId = await requireAuth(ctx);
    if (!authUserId) return null;

    return {};
  },
});
