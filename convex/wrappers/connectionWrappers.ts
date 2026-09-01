import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import { encryptedSecretValidator } from "../schemas/connectionsSchema";
import * as ConnectionModels from "../models/connectionModels";
import * as OAuthAttemptModels from "../models/oauthAttemptModels";

// ── Connexions ──────────────────────────────────────────────────────────

/**
 * Lecture COMPLÈTE d'une connexion, secret chiffré inclus. `internalQuery` :
 * jamais exposée au client, seule une action a le droit d'appeler ceci — et
 * uniquement pour déchiffrer juste avant l'appel réseau.
 */
export const readConnection = internalQuery({
  args: { connectionId: v.id("connections") },
  handler: async (ctx, args) => await ctx.db.get(args.connectionId),
});

/** Connexion possédée par un utilisateur, sans le secret. Sert aux actions,
 * qui n'ont pas de `ctx.db` pour vérifier la propriété elles-mêmes. */
export const findOwned = internalQuery({
  args: { connectionId: v.id("connections"), userId: v.id("users") },
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    if (!connection || connection.userId !== args.userId) return null;
    return ConnectionModels.toPublic(connection);
  },
});

export const upsertFromOAuth = internalMutation({
  args: {
    userId: v.id("users"),
    provider: v.string(),
    externalAccountId: v.string(),
    label: v.string(),
    scopes: v.array(v.string()),
    secret: encryptedSecretValidator,
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) =>
    await ConnectionModels.upsertFromOAuth(ctx, args),
});

export const claimRefresh = internalMutation({
  args: { connectionId: v.id("connections") },
  returns: v.boolean(),
  handler: async (ctx, args) =>
    await ConnectionModels.claimRefresh(ctx, args.connectionId),
});

export const applyRefresh = internalMutation({
  args: {
    connectionId: v.id("connections"),
    secret: encryptedSecretValidator,
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => await ConnectionModels.applyRefresh(ctx, args),
});

export const releaseRefresh = internalMutation({
  args: { connectionId: v.id("connections") },
  handler: async (ctx, args) =>
    await ConnectionModels.releaseRefresh(ctx, args.connectionId),
});

export const markNeedsReauth = internalMutation({
  args: { connectionId: v.id("connections"), message: v.string() },
  handler: async (ctx, args) =>
    await ConnectionModels.markNeedsReauth(
      ctx,
      args.connectionId,
      args.message,
    ),
});

export const touchLastUsedAt = internalMutation({
  args: { connectionId: v.id("connections") },
  handler: async (ctx, args) =>
    await ConnectionModels.touchLastUsedAt(ctx, args.connectionId),
});

/**
 * Le compte distant peut avoir changé de nom entre deux connexions (adresse
 * renommée, login GitHub changé). Le test de connexion en profite pour
 * rafraîchir l'étiquette affichée.
 */
export const renameConnection = internalMutation({
  args: { connectionId: v.id("connections"), label: v.string() },
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    if (!connection || connection.label === args.label) return;
    await ctx.db.patch(args.connectionId, {
      label: args.label,
      updatedAt: Date.now(),
    });
  },
});

// ── Tentatives OAuth ────────────────────────────────────────────────────

export const consumeAttempt = internalMutation({
  args: { attemptId: v.string(), nonce: v.string() },
  handler: async (ctx, args) => await OAuthAttemptModels.consume(ctx, args),
});

export const pruneExpiredAttempts = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => await OAuthAttemptModels.pruneExpired(ctx),
});
