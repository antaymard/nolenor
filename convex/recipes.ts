import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAuth } from "./lib/auth";

export const listUserRecipes = query({
  args: {},
  handler: async (ctx) => {
    const authUserId = await requireAuth(ctx);

    return await ctx.db
      .query("recipes")
      .withIndex("by_user", (q) => q.eq("userId", authUserId))
      .collect();
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const authUserId = await requireAuth(ctx);

    const recipeId = await ctx.db.insert("recipes", {
      name: args.name,
      content: args.content,
      userId: authUserId,
      updatedAt: Date.now(),
    });

    return { success: true, recipeId };
  },
});
