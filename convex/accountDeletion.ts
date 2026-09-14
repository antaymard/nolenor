import { ConvexError, v } from "convex/values";
import { internalMutation, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireAuth } from "./lib/auth";
import errors from "./config/errorsConfig";
import * as AccountDeletionModels from "./models/accountDeletionModels";

/**
 * Suppression définitive du compte de l'appelant.
 *
 * L'adresse email est redemandée en argument et comparée à celle du compte :
 * c'est le geste qui distingue « je veux supprimer mon compte » d'un clic de
 * trop. Elle est vérifiée ici et pas seulement dans la modale — une mutation
 * publique est appelable sans passer par l'UI, et c'est la seule action de
 * l'app qu'on ne peut pas annuler.
 *
 * L'id vient de la session, jamais des arguments : on ne peut supprimer que
 * son propre compte.
 *
 * Quand cette mutation rend la main, le compte n'existe plus (cf.
 * `teardownAuth`) ; le contenu, lui, s'efface en tâche de fond.
 */
export const deleteMyAccount = mutation({
  args: { email: v.string() },
  returns: v.null(),
  handler: async (ctx, { email }) => {
    const userId = await requireAuth(ctx);

    const user = await ctx.db.get(userId);
    if (!user) throw new ConvexError(errors.USER_NOT_FOUND);

    // Un compte sans adresse ne peut pas passer la confirmation. Le cas
    // n'existe pas aujourd'hui (les deux providers en fournissent une), mais
    // il vaut mieux un refus explicite qu'une comparaison avec `undefined`.
    if (!user.email) {
      throw new ConvexError(errors.ACCOUNT_DELETION_NO_EMAIL);
    }

    // Comparaison insensible à la casse et aux espaces : ce qu'on vérifie,
    // c'est que l'utilisateur sait quel compte il détruit, pas sa frappe.
    if (email.trim().toLowerCase() !== user.email.toLowerCase()) {
      throw new ConvexError(errors.ACCOUNT_DELETION_EMAIL_MISMATCH);
    }

    await AccountDeletionModels.teardownAuth(ctx, { userId });

    await ctx.scheduler.runAfter(0, internal.accountDeletion.purgeUserData, {
      userId,
    });

    return null;
  },
});

/**
 * Purge des données du compte, un lot par transaction, re-schedulée tant qu'il
 * reste quelque chose (cf. `purgeUserDataStep`).
 *
 * Interne : le compte a déjà disparu quand elle s'exécute, il n'y a plus
 * personne à authentifier. `userId` n'est plus qu'une clé d'index — les
 * documents qu'il désigne sont orphelins, et c'est précisément ce qu'on vient
 * ramasser.
 */
export const purgeUserData = internalMutation({
  args: { userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, { userId }): Promise<null> => {
    const hasMore = await AccountDeletionModels.purgeUserDataStep(ctx, {
      userId,
    });
    if (hasMore) {
      await ctx.scheduler.runAfter(0, internal.accountDeletion.purgeUserData, {
        userId,
      });
    }
    return null;
  },
});
