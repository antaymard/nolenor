import { createThread } from "@convex-dev/agent";
import { ConvexError } from "convex/values";
import { components } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import errors from "../config/errorsConfig";
import { submitToThread } from "../harness/tasks";
import {
  noleMessageContent,
  noleProfile,
  type NoleRunInput,
} from "../ia/profiles/nole";
import { requireCanvasAccess } from "../lib/auth";
import { enforceRateLimit } from "../lib/rateLimits";
import { nextRunAt, scheduleError } from "../lib/recipeSchedule";
import type { RecipeTrigger } from "../schemas/recipesSchema";
import { threadAgentNames } from "../schemas/threadMetadataSchema";
import * as RunModels from "./runModels";

/**
 * Les recipes (cf. schemas/recipesSchema.ts). Toutes les écritures de la
 * table passent par ici.
 */

type Recipe = Doc<"recipes">;

/** Recipes planifiées actives par utilisateur. */
export const MAX_SCHEDULED_RECIPES = 10;
const MAX_TRIGGERS = 5;
const MAX_ONCE_AHEAD_MS = 366 * 24 * 60 * 60 * 1000;
/** Borne de lecture des recipes d'un utilisateur. */
export const MAX_RECIPES_PER_USER = 200;

export type RecipeFields = {
  name: string;
  instructions: string;
  canvasId: Id<"canvases">;
  triggers: RecipeTrigger[];
  enabled: boolean;
};

/**
 * Nettoie et vérifie les champs saisis ; throw une erreur lisible sinon.
 *
 * Un `once` doit tomber dans le futur — sauf s'il figurait déjà dans la
 * recipe (`existing`) : le formulaire renvoie tels quels les déclencheurs
 * déjà passés, et ils ne doivent pas bloquer l'enregistrement.
 */
export function normalizeFields(
  fields: RecipeFields,
  now: number,
  existing: readonly RecipeTrigger[] = [],
): RecipeFields {
  const name = fields.name.trim();
  const instructions = fields.instructions.trim();
  if (!name) throw new ConvexError(errors.RECIPE_NAME_REQUIRED);
  if (!instructions) throw new ConvexError(errors.RECIPE_INSTRUCTIONS_REQUIRED);
  if (fields.triggers.length > MAX_TRIGGERS) {
    throw new ConvexError(errors.RECIPE_TOO_MANY_TRIGGERS);
  }
  for (const trigger of fields.triggers) {
    if (trigger.kind === "schedule") {
      const error = scheduleError(trigger);
      if (error) throw new ConvexError(error);
    } else if (trigger.kind === "once") {
      const kept = existing.some(
        (t) => t.kind === "once" && t.at === trigger.at,
      );
      if (trigger.at <= now && !kept) {
        throw new ConvexError(errors.RECIPE_ONCE_IN_PAST);
      }
      if (trigger.at > now + MAX_ONCE_AHEAD_MS) {
        throw new ConvexError(errors.RECIPE_ONCE_TOO_FAR);
      }
    }
  }
  return { ...fields, name, instructions };
}

/** Le prochain lancement d'une recipe : seulement si active et planifiée. */
export function computeNextRunAt(
  recipe: Pick<Recipe, "enabled" | "triggers">,
  after: number,
): number | undefined {
  return recipe.enabled ? nextRunAt(recipe.triggers, after) : undefined;
}

export async function listByUser(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<Recipe[]> {
  return ctx.db
    .query("recipes")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .take(MAX_RECIPES_PER_USER);
}

/**
 * Plafond des routines : une recipe qui aura un prochain lancement planifié
 * ne doit pas faire dépasser `MAX_SCHEDULED_RECIPES` à son propriétaire. Une
 * recipe compte tant qu'elle a un lancement à venir (`nextRunAt`) : un `once`
 * passé ne compte plus.
 */
export async function assertScheduledQuota(
  ctx: MutationCtx,
  userId: Id<"users">,
  candidate: {
    recipeId?: Id<"recipes">;
    enabled: boolean;
    triggers: RecipeTrigger[];
  },
  now: number,
): Promise<void> {
  if (computeNextRunAt(candidate, now) === undefined) return;
  const others = (await listByUser(ctx, userId)).filter(
    (recipe) =>
      recipe._id !== candidate.recipeId && recipe.nextRunAt !== undefined,
  );
  if (others.length >= MAX_SCHEDULED_RECIPES) {
    throw new ConvexError(errors.RECIPE_TOO_MANY_SCHEDULED);
  }
}

/** Le propriétaire peut toujours lancer ; les autres, si `manual` est actif. */
export function canLaunch(recipe: Recipe, userId: Id<"users">): boolean {
  if (recipe.userId === userId) return true;
  return recipe.enabled && recipe.triggers.some((t) => t.kind === "manual");
}

/**
 * Lance une recipe au nom de `userId` : ses instructions partent à Nolë dans
 * un nouveau thread du canvas, par le même chemin qu'un message du chat
 * (`submitToThread`). La harness ouvre le run ; on le rattache ensuite à la
 * recipe.
 *
 * Les droits sont ceux d'un message à Nolë : `editor` du canvas, puisque Nolë
 * y a tous ses tools d'écriture. Throw si refusé, si le run précédent de la
 * recipe tourne encore, ou si le quota de lancements est épuisé.
 */
export async function launch(
  ctx: MutationCtx,
  recipe: Recipe,
  userId: Id<"users">,
): Promise<{ threadId: string; runMessageId: string }> {
  await requireCanvasAccess(ctx, recipe.canvasId, userId, "editor");
  if (await RunModels.findActiveRecipeRun(ctx, recipe._id)) {
    throw new ConvexError(errors.RECIPE_ALREADY_RUNNING);
  }
  await enforceRateLimit(ctx, "recipeRun", userId);

  const threadId = await createThread(ctx, components.agent, {
    userId,
    title: recipe.name,
  });
  await ctx.db.insert("threadMetadata", {
    threadId,
    userId,
    canvasId: recipe.canvasId,
    totalUsageUsd: 0,
    agentName: threadAgentNames.nole,
  });

  const result = await submitToThread(ctx, {
    threadId,
    userId,
    canvasId: recipe.canvasId,
    profile: noleProfile,
    prompt: recipe.instructions,
    content: noleMessageContent(recipe.instructions, undefined),
    input: { userPrompt: recipe.instructions } satisfies NoleRunInput,
  });
  // Un thread neuf n'a ni run en cours ni question en attente : le message
  // ouvre toujours un run.
  if (!("messageId" in result)) {
    throw new Error("A new recipe thread did not open a run.");
  }

  await RunModels.setRunRecipe(ctx, result.messageId, recipe._id);
  await ctx.db.patch("recipes", recipe._id, { lastRunAt: Date.now() });
  return { threadId, runMessageId: result.messageId };
}

/**
 * Le lancement planifié d'une routine, au nom de son propriétaire. Rend ce
 * qui s'est passé plutôt que de throw : un créneau sauté ne doit pas faire
 * échouer le cron.
 *
 * - propriétaire qui n'est plus `editor` du canvas (ou canvas supprimé) : la
 *   routine se désactive ;
 * - run précédent encore en cours, ou quota épuisé : créneau sauté.
 */
export async function launchScheduled(
  ctx: MutationCtx,
  recipe: Recipe,
): Promise<"launched" | "disabled" | "skipped"> {
  try {
    await requireCanvasAccess(ctx, recipe.canvasId, recipe.userId, "editor");
  } catch {
    await ctx.db.patch("recipes", recipe._id, {
      enabled: false,
      nextRunAt: undefined,
      updatedAt: Date.now(),
    });
    return "disabled";
  }
  if (await RunModels.findActiveRecipeRun(ctx, recipe._id)) return "skipped";
  try {
    await launch(ctx, recipe, recipe.userId);
  } catch (error) {
    // Les refus de `launch` (droits, run en cours, quota) tombent tous avant
    // sa première écriture : rien à défaire. Une autre erreur fait échouer la
    // mutation, qui annule tout.
    if (error instanceof ConvexError) return "skipped";
    throw error;
  }
  return "launched";
}
