import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { requireAuth } from "./lib/auth";
import * as OnboardingModels from "./models/onboardingModels";

// Appelée par le dispatcher `/` (src/routes/index.tsx) quand un compte
// authentifié n'a aucun canvas — la branche qui affichait jusqu'ici « No
// workspace found ». Clone `TUTORIAL_CANVAS_ID` (variable d'env Convex) si
// elle est configurée, sinon crée un canvas vide comme aujourd'hui.
//
// Idempotente : elle rend le canvas existant si le compte en a déjà un.
export const provisionFirstCanvas = mutation({
  args: {},
  returns: v.id("canvases"),
  handler: async (ctx) => {
    const authUserId = await requireAuth(ctx);
    return await OnboardingModels.provisionFirstCanvasForUser(ctx, {
      authUserId,
    });
  },
});
