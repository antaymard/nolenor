import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { optionalAuth, requireAuth } from "./lib/auth";

// Le nom part dans le system prompt de Nolë : le borner évite qu'un champ de
// profil serve de canal pour y injecter un pavé d'instructions.
const MAX_NAME_LENGTH = 80;

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

/**
 * Nom d'affichage de l'appelant. Renseigné à l'inscription par le provider
 * d'auth (Google…), pas toujours sous une forme que l'utilisateur reconnaît —
 * et vide pour un compte créé par email.
 *
 * Nolë le reçoit dans son system prompt (cf. `generateNoleSystemPrompt`), donc
 * c'est aussi ce qui lui permet d'appeler l'utilisateur par son prénom sans
 * avoir à le lui demander puis à le noter en mémoire.
 *
 * L'id vient de la session : personne ne peut renommer un tiers.
 */
export const updateName = mutation({
  args: { name: v.string() },
  returns: v.null(),
  handler: async (ctx, { name }) => {
    const userId = await requireAuth(ctx);
    const trimmed = name.trim();

    if (trimmed.length > MAX_NAME_LENGTH) {
      throw new ConvexError(
        `Name is too long (${MAX_NAME_LENGTH} characters max).`,
      );
    }

    // Champ retiré plutôt que laissé à "" : `users.me` le renvoie en optionnel,
    // et une chaîne vide traverserait tout le chemin (prompt compris) comme un
    // nom qui n'en est pas un.
    await ctx.db.patch(userId, {
      name: trimmed.length > 0 ? trimmed : undefined,
    });
    return null;
  },
});
