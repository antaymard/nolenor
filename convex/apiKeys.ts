import { v } from "convex/values";
import { ConvexError } from "convex/values";
import {
  action,
  internalMutation,
  internalQuery,
  query,
  mutation,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { requireAuth } from "./lib/auth";
import errors from "./config/errorsConfig";

export const API_KEY_PREFIX = "nlnr_";

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

/** SHA-256 hex d'une clé API. À n'appeler que depuis des actions/httpActions. */
export async function hashApiKey(key: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(key),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Crée une clé API pour l'utilisateur connecté.
 * Action (et non mutation) car le hachage utilise crypto.subtle.
 * La clé en clair n'est retournée qu'ici, une seule fois.
 */
export const create = action({
  args: { name: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{ key: string; name: string; prefix: string }> => {
    const authUserId = await requireAuth(ctx);

    const name = args.name.trim();
    if (!name) {
      throw new ConvexError("Please provide a name for this API key.");
    }

    const randomBytes = new Uint8Array(32);
    crypto.getRandomValues(randomBytes);
    const key = `${API_KEY_PREFIX}${toBase64Url(randomBytes)}`;
    const prefix = key.slice(0, API_KEY_PREFIX.length + 8);

    await ctx.runMutation(internal.apiKeys.store, {
      userId: authUserId,
      name,
      keyHash: await hashApiKey(key),
      prefix,
    });

    return { key, name, prefix };
  },
});

export const store = internalMutation({
  args: {
    userId: v.id("users"),
    name: v.string(),
    keyHash: v.string(),
    prefix: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("apiKeys", args);
  },
});

/** Liste les clés de l'utilisateur connecté (jamais le hash). */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const authUserId = await requireAuth(ctx);

    const keys = await ctx.db
      .query("apiKeys")
      .withIndex("by_user", (q) => q.eq("userId", authUserId))
      .collect();

    return keys.map((key) => ({
      _id: key._id,
      name: key.name,
      prefix: key.prefix,
      createdAt: key._creationTime,
      lastUsedAt: key.lastUsedAt,
      revoked: key.revokedAt !== undefined,
    }));
  },
});

export const revoke = mutation({
  args: { keyId: v.id("apiKeys") },
  handler: async (ctx, args) => {
    const authUserId = await requireAuth(ctx);

    const key = await ctx.db.get(args.keyId);
    if (!key || key.userId !== authUserId) {
      throw new ConvexError(errors.UNAUTHORIZED_USER);
    }
    if (key.revokedAt !== undefined) return;

    await ctx.db.patch(args.keyId, { revokedAt: Date.now() });
  },
});

/** Résout un hash de clé vers son propriétaire. Null si inconnue ou révoquée. */
export const validate = internalQuery({
  args: { keyHash: v.string() },
  handler: async (ctx, args) => {
    const key = await ctx.db
      .query("apiKeys")
      .withIndex("by_keyHash", (q) => q.eq("keyHash", args.keyHash))
      .unique();

    if (!key || key.revokedAt !== undefined) return null;

    return {
      keyId: key._id,
      userId: key.userId,
      lastUsedAt: key.lastUsedAt,
    };
  },
});

export const touch = internalMutation({
  args: { keyId: v.id("apiKeys") },
  handler: async (ctx, args) => {
    const key = await ctx.db.get(args.keyId);
    if (!key || key.revokedAt !== undefined) return;
    await ctx.db.patch(args.keyId, { lastUsedAt: Date.now() });
  },
});
