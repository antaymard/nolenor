import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { sha256Hex } from "../lib/secretCrypto";

/**
 * Durée de vie d'une tentative. Large pour laisser le temps de choisir un
 * compte et de lire l'écran de consentement, courte devant la valeur de ce
 * qu'elle protège.
 */
const ATTEMPT_TTL_MS = 10 * 60 * 1000;

export async function create(
  ctx: MutationCtx,
  {
    userId,
    provider,
    nonce,
    codeVerifier,
    returnOrigin,
  }: {
    userId: Id<"users">;
    provider: string;
    nonce: string;
    codeVerifier?: string;
    returnOrigin: string;
  },
): Promise<Id<"oauthAttempts">> {
  return await ctx.db.insert("oauthAttempts", {
    userId,
    provider,
    nonceHash: await sha256Hex(nonce),
    codeVerifier,
    returnOrigin,
    expiresAt: Date.now() + ATTEMPT_TTL_MS,
  });
}

/**
 * Consomme une tentative : la valide et la supprime dans la même transaction.
 * La suppression est ce qui rend le `state` inrejouable — un second retour
 * avec le même state ne trouvera plus rien.
 *
 * Rend `null` sur tous les cas d'échec sans dire lequel : le callback est un
 * endpoint public, et distinguer « inconnu » de « nonce faux » renseignerait
 * un attaquant sur la moitié qu'il a devinée.
 */
export async function consume(
  ctx: MutationCtx,
  { attemptId, nonce }: { attemptId: string; nonce: string },
): Promise<Doc<"oauthAttempts"> | null> {
  const normalized = ctx.db.normalizeId("oauthAttempts", attemptId);
  if (!normalized) return null;

  const attempt = await ctx.db.get(normalized);
  if (!attempt) return null;

  // Expirée : on la supprime au passage, elle ne servira plus.
  if (attempt.expiresAt < Date.now()) {
    await ctx.db.delete(attempt._id);
    return null;
  }

  if (attempt.nonceHash !== (await sha256Hex(nonce))) return null;

  await ctx.db.delete(attempt._id);
  return attempt;
}

/**
 * Purge des tentatives jamais abouties. Elles ne portent aucun credential,
 * mais une table qui ne fait que grossir finit par coûter.
 */
export async function pruneExpired(ctx: MutationCtx): Promise<number> {
  const expired = await ctx.db
    .query("oauthAttempts")
    .withIndex("by_expiresAt", (q) => q.lt("expiresAt", Date.now()))
    .take(500);

  for (const attempt of expired) {
    await ctx.db.delete(attempt._id);
  }
  return expired.length;
}
