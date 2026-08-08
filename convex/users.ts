import { v } from "convex/values";
import { query } from "./_generated/server";
import { optionalAuth } from "./lib/auth";

/**
 * Identité de l'appelant, et rien d'autre : l'id vient de la session, donc il
 * n'y a pas de moyen de lire le document d'un tiers par cette fonction.
 *
 * Sert à rattacher les erreurs remontées à PostHog à un utilisateur
 * (cf. `src/lib/analytics.ts`) : une erreur imputable à un navigateur anonyme
 * est rarement reproductible.
 *
 * `optionalAuth` et pas `requireAuth` : cette query est montée sur la route
 * racine, y compris pour un visiteur anonyme d'un canvas public. Un throw ici
 * ferait tomber toute l'app pour lui.
 */
export const me = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("users"),
      email: v.optional(v.string()),
      name: v.optional(v.string()),
    }),
  ),
  handler: async (ctx) => {
    const userId = await optionalAuth(ctx);
    if (!userId) return null;

    const user = await ctx.db.get(userId);
    if (!user) return null;

    return {
      _id: user._id,
      ...(user.email !== undefined ? { email: user.email } : {}),
      ...(user.name !== undefined ? { name: user.name } : {}),
    };
  },
});
