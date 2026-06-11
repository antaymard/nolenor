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

export const read = query({
  args: {
    recipeId: v.id("recipes"),
  },
  handler: async (ctx, args) => {
    const authUserId = await requireAuth(ctx);

    const recipe = await ctx.db.get(args.recipeId);

    if (!recipe) {
      throw new Error("Recipe not found");
    }

    if (recipe.userId !== authUserId) {
      throw new Error("Unauthorized");
    }

    return recipe;
  },
});

export const upsert = mutation({
  args: {
    name: v.string(),
    content: v.string(),
    recipeId: v.optional(v.id("recipes")),
    operation: v.union(v.literal("create"), v.literal("update")),
  },
  handler: async (ctx, args) => {
    const authUserId = await requireAuth(ctx);

    // Update existing recipe
    if (args.operation === "update") {
      if (!args.recipeId) {
        throw new Error("Recipe ID is required for update");
      }

      const recipe = await ctx.db.get(args.recipeId);

      if (!recipe) {
        throw new Error("Recipe not found");
      }

      if (recipe.userId !== authUserId) {
        throw new Error("Unauthorized");
      }

      await ctx.db.patch(args.recipeId, {
        name: args.name,
        content: args.content,
        updatedAt: Date.now(),
      });

      return { success: true, recipeId: recipe._id };
    }

    // Create new recipe
    const recipeId = await ctx.db.insert("recipes", {
      name: args.name,
      content: args.content,
      userId: authUserId,
      updatedAt: Date.now(),
    });

    return { success: true, recipeId };
  },
});

export const trash = mutation({
  args: {
    recipeId: v.id("recipes"),
  },
  handler: async (ctx, args) => {
    const authUserId = await requireAuth(ctx);

    const recipe = await ctx.db.get(args.recipeId);

    if (!recipe) {
      throw new Error("Recipe not found");
    }

    if (recipe.userId !== authUserId) {
      throw new Error("Unauthorized");
    }

    await ctx.db.delete(args.recipeId);

    return { success: true };
  },
});
