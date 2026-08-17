import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { optionalAuth, requireAuth } from "./lib/auth";
import { resolveUserDisplayName } from "./lib/userDisplayName";

// Le nom part dans le system prompt de Nolë : le borner évite qu'un champ de
// profil serve de canal pour y injecter un pavé d'instructions.
const MAX_DISPLAY_NAME_LENGTH = 80;

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
 *
 * Les deux cases du nom sont renvoyées séparément plutôt que déjà fusionnées :
 * l'écran Account doit pouvoir distinguer « l'utilisateur a choisi ce nom » de
 * « c'est le provider qui le fournit », pour proposer le second en placeholder
 * du champ vide. Partout ailleurs, `displayName` est la valeur à afficher.
 */
export const me = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("users"),
      email: v.optional(v.string()),
      // Nom résolu (choisi par l'utilisateur, sinon celui du provider).
      displayName: v.union(v.string(), v.null()),
      // Nom brut posé par le provider d'auth, sans le repli ci-dessus.
      providerName: v.optional(v.string()),
      // Nom brut choisi par l'utilisateur : vide tant qu'il n'y a pas touché.
      customName: v.optional(v.string()),
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
      displayName: resolveUserDisplayName(user),
      ...(user.name !== undefined ? { providerName: user.name } : {}),
      ...(user.displayName !== undefined
        ? { customName: user.displayName }
        : {}),
    };
  },
});

/**
 * Nom que l'utilisateur se donne, et sous lequel Nolë s'adresse à lui — elle le
 * reçoit dans son system prompt (cf. `generateNoleSystemPrompt`), donc plus
 * besoin qu'elle le demande puis le range en mémoire.
 *
 * Écrit dans `displayName`, jamais dans `name` : `name` appartient au provider
 * d'auth, qui le réécrit à chaque connexion OAuth (cf. le commentaire de la
 * table `users` dans schema.ts).
 *
 * Vider le champ n'est pas une erreur : c'est le geste qui rend la main au nom
 * du provider, via le repli de `resolveUserDisplayName`.
 *
 * L'id vient de la session : personne ne peut renommer un tiers.
 */
export const updateDisplayName = mutation({
  args: { displayName: v.string() },
  returns: v.null(),
  handler: async (ctx, { displayName }) => {
    const userId = await requireAuth(ctx);
    const trimmed = displayName.trim();

    if (trimmed.length > MAX_DISPLAY_NAME_LENGTH) {
      throw new ConvexError(
        `Name is too long (${MAX_DISPLAY_NAME_LENGTH} characters max).`,
      );
    }

    // Champ retiré plutôt que laissé à "" : une chaîne vide traverserait tout
    // le chemin (prompt compris) comme un nom qui n'en est pas un, et court-
    // circuiterait le repli sur le nom du provider.
    await ctx.db.patch(userId, {
      displayName: trimmed.length > 0 ? trimmed : undefined,
    });
    return null;
  },
});
