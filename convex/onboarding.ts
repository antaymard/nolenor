import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import * as OnboardingModels from "./models/onboardingModels";

/**
 * Provisionne le premier canvas d'un compte fraîchement créé.
 *
 * Interne : le seul appelant est `afterUserCreatedOrUpdated` (convex/auth.ts),
 * qui la planifie à l'inscription. Aucun chemin client ne doit la déclencher.
 */
export const provisionForNewUser = internalMutation({
  args: { userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, { userId }) => {
    await OnboardingModels.provisionFirstCanvasForUser(ctx, {
      authUserId: userId,
    });
    return null;
  },
});
