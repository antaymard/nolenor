import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import errors from "./config/errorsConfig";
import { requireAuth, requireCanvasAccess } from "./lib/auth";
import * as RecipeModels from "./models/recipeModels";
import { vRecipeTrigger } from "./schemas/recipesSchema";

/**
 * Les recipes : CRUD depuis les réglages, lancement au clic, et le cron des
 * routines. Le lancement lui-même vit dans models/recipeModels.ts.
 */

/** Recipes planifiées traitées par passage du cron. */
const DUE_BATCH = 50;
/** Runs d'une recipe montrés dans son historique. */
const RUNS_LIMIT = 20;

const recipeFields = {
  name: v.string(),
  instructions: v.string(),
  canvasId: v.id("canvases"),
  triggers: v.array(vRecipeTrigger),
  enabled: v.boolean(),
};

/** La recipe, si elle existe et appartient à l'utilisateur ; throw sinon. */
async function requireOwnRecipe(
  ctx: QueryCtx | MutationCtx,
  recipeId: Id<"recipes">,
  userId: Id<"users">,
) {
  const recipe = await ctx.db.get("recipes", recipeId);
  // Même message pour « inexistante » et « pas à toi » : on ne révèle pas
  // l'existence des recipes des autres.
  if (!recipe || recipe.userId !== userId) {
    throw new ConvexError(errors.RECIPE_NOT_FOUND);
  }
  return recipe;
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);
    return RecipeModels.listByUser(ctx, userId);
  },
});

/**
 * La recipe, ou `null` si elle n'existe pas ou n'est pas à l'utilisateur :
 * l'éditeur reste abonné un instant à une recipe qu'on vient de supprimer.
 */
export const get = query({
  args: { recipeId: v.id("recipes") },
  handler: async (ctx, { recipeId }) => {
    const userId = await requireAuth(ctx);
    const recipe = await ctx.db.get("recipes", recipeId);
    return recipe && recipe.userId === userId ? recipe : null;
  },
});

export const create = mutation({
  args: recipeFields,
  returns: v.id("recipes"),
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const now = Date.now();
    const fields = RecipeModels.normalizeFields(args, now);
    // Le propriétaire doit pouvoir lancer sa recipe là où elle vise.
    await requireCanvasAccess(ctx, fields.canvasId, userId, "editor");
    await RecipeModels.assertScheduledQuota(ctx, userId, fields, now);

    return ctx.db.insert("recipes", {
      ...fields,
      userId,
      nextRunAt: RecipeModels.computeNextRunAt(fields, now),
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: { recipeId: v.id("recipes"), ...recipeFields },
  returns: v.null(),
  handler: async (ctx, { recipeId, ...args }) => {
    const userId = await requireAuth(ctx);
    const recipe = await requireOwnRecipe(ctx, recipeId, userId);
    const now = Date.now();
    const fields = RecipeModels.normalizeFields(args, now, recipe.triggers);
    await requireCanvasAccess(ctx, fields.canvasId, userId, "editor");
    await RecipeModels.assertScheduledQuota(
      ctx,
      userId,
      { recipeId, ...fields },
      now,
    );

    await ctx.db.patch("recipes", recipeId, {
      ...fields,
      nextRunAt: RecipeModels.computeNextRunAt(fields, now),
      updatedAt: now,
    });
    return null;
  },
});

export const setEnabled = mutation({
  args: { recipeId: v.id("recipes"), enabled: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { recipeId, enabled }) => {
    const userId = await requireAuth(ctx);
    const recipe = await requireOwnRecipe(ctx, recipeId, userId);
    const now = Date.now();
    await RecipeModels.assertScheduledQuota(
      ctx,
      userId,
      { recipeId, enabled, triggers: recipe.triggers },
      now,
    );

    await ctx.db.patch("recipes", recipeId, {
      enabled,
      nextRunAt: RecipeModels.computeNextRunAt(
        { enabled, triggers: recipe.triggers },
        now,
      ),
      updatedAt: now,
    });
    return null;
  },
});

export const remove = mutation({
  args: { recipeId: v.id("recipes") },
  returns: v.null(),
  handler: async (ctx, { recipeId }) => {
    const userId = await requireAuth(ctx);
    await requireOwnRecipe(ctx, recipeId, userId);
    // Les runs passés restent : ce sont des tâches de Nolë comme les autres,
    // leur `recipeId` pointe simplement vers une recipe disparue.
    await ctx.db.delete("recipes", recipeId);
    return null;
  },
});

/**
 * Lancement au clic, au nom de celui qui clique : le propriétaire depuis les
 * réglages, ou un membre du canvas depuis un TaskNode si la recipe a un
 * déclencheur `manual`.
 */
export const launch = mutation({
  args: { recipeId: v.id("recipes") },
  returns: v.object({ threadId: v.string() }),
  handler: async (ctx, { recipeId }) => {
    const userId = await requireAuth(ctx);
    const recipe = await ctx.db.get("recipes", recipeId);
    if (!recipe) throw new ConvexError(errors.RECIPE_NOT_FOUND);
    if (!RecipeModels.canLaunch(recipe, userId)) {
      throw new ConvexError(errors.RECIPE_NOT_LAUNCHABLE);
    }
    const { threadId } = await RecipeModels.launch(ctx, recipe, userId);
    return { threadId };
  },
});

/** L'historique d'une recipe, pour son propriétaire. */
export const listRuns = query({
  args: { recipeId: v.id("recipes") },
  handler: async (ctx, { recipeId }) => {
    const userId = await requireAuth(ctx);
    // Vide plutôt qu'une erreur : comme `get`, la vue peut rester abonnée un
    // instant à une recipe supprimée.
    const recipe = await ctx.db.get("recipes", recipeId);
    if (!recipe || recipe.userId !== userId) return [];
    return ctx.db
      .query("runs")
      .withIndex("by_recipeId", (q) => q.eq("recipeId", recipeId))
      .order("desc")
      .take(RUNS_LIMIT);
  },
});

// ── Routines ─────────────────────────────────────────────────────────────────

/**
 * Le cron (chaque minute) : les recipes dont le prochain lancement est passé.
 * Chacune est lancée dans sa propre mutation, pour qu'une erreur n'emporte
 * pas les autres, et son `nextRunAt` avance tout de suite au créneau suivant
 * l'instant présent : pas de rattrapage des créneaux manqués, une seule
 * exécution puis on reprend le rythme.
 */
export const runDue = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now();
    // `gt(0)` écarte les recipes sans `nextRunAt`, que l'index range en tête.
    const due = await ctx.db
      .query("recipes")
      .withIndex("by_nextRunAt", (q) =>
        q.gt("nextRunAt", 0).lte("nextRunAt", now),
      )
      .take(DUE_BATCH);

    for (const recipe of due) {
      await ctx.db.patch("recipes", recipe._id, {
        nextRunAt: RecipeModels.computeNextRunAt(recipe, now),
      });
      await ctx.scheduler.runAfter(0, internal.recipes.runScheduled, {
        recipeId: recipe._id,
      });
    }
    // Plus que ce qu'un passage traite : on enchaîne sans attendre la minute.
    if (due.length === DUE_BATCH) {
      await ctx.scheduler.runAfter(0, internal.recipes.runDue, {});
    }
    return null;
  },
});

export const runScheduled = internalMutation({
  args: { recipeId: v.id("recipes") },
  returns: v.null(),
  handler: async (ctx, { recipeId }) => {
    const recipe = await ctx.db.get("recipes", recipeId);
    // Supprimée ou désactivée entre le cron et ici.
    if (!recipe || !recipe.enabled) return null;
    await RecipeModels.launchScheduled(ctx, recipe);
    return null;
  },
});
