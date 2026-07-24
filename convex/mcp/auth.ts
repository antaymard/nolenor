import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import { apiTokenPermissionValidator } from "../schemas/apiTokensSchema";

// Réduit les writes : un token utilisé en rafale (une session MCP) ne
// patche lastUsedAt qu'une fois par minute.
const LAST_USED_THROTTLE_MS = 60_000;

/**
 * Résout un Bearer token (déjà hashé côté httpAction) vers son propriétaire.
 * Retourne null pour un token inconnu ou révoqué — le endpoint répond 401.
 */
export const getTokenByHash = internalQuery({
  args: { tokenHash: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      tokenId: v.id("apiTokens"),
      userId: v.id("users"),
      permission: apiTokenPermissionValidator,
    }),
  ),
  handler: async (ctx, args) => {
    const token = await ctx.db
      .query("apiTokens")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", args.tokenHash))
      .unique();

    if (!token || token.revokedAt !== undefined) {
      return null;
    }

    return {
      tokenId: token._id,
      userId: token.userId,
      permission: token.permission,
    };
  },
});

export const touchLastUsedAt = internalMutation({
  args: { tokenId: v.id("apiTokens") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const token = await ctx.db.get(args.tokenId);
    if (!token || token.revokedAt !== undefined) {
      return null;
    }

    if (
      token.lastUsedAt !== undefined &&
      Date.now() - token.lastUsedAt < LAST_USED_THROTTLE_MS
    ) {
      return null;
    }

    await ctx.db.patch(args.tokenId, { lastUsedAt: Date.now() });
    return null;
  },
});
