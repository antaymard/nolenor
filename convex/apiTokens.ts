import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAuth } from "./lib/auth";
import {
  generateApiToken,
  getDisplayPrefix,
  hashApiToken,
} from "./lib/apiTokenCrypto";
import { apiTokenPermissionValidator } from "./schemas/apiTokensSchema";
import errors from "./config/errorsConfig";

export const list = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("apiTokens"),
      name: v.string(),
      permission: apiTokenPermissionValidator,
      tokenPrefix: v.string(),
      createdAt: v.number(),
      updatedAt: v.number(),
      lastUsedAt: v.optional(v.number()),
      revokedAt: v.optional(v.number()),
    }),
  ),
  handler: async (ctx) => {
    const authUserId = await requireAuth(ctx);

    const tokens = await ctx.db
      .query("apiTokens")
      .withIndex("by_user", (q) => q.eq("userId", authUserId))
      .collect();

    return tokens.map((token) => ({
      _id: token._id,
      name: token.name,
      permission: token.permission,
      tokenPrefix: token.tokenPrefix,
      createdAt: token._creationTime,
      updatedAt: token.updatedAt,
      lastUsedAt: token.lastUsedAt,
      revokedAt: token.revokedAt,
    }));
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    permission: apiTokenPermissionValidator,
  },
  returns: v.object({
    _id: v.id("apiTokens"),
    token: v.string(),
  }),
  handler: async (ctx, args) => {
    const authUserId = await requireAuth(ctx);

    const name = args.name.trim();
    if (!name) {
      throw new ConvexError(errors.TOKEN_NAME_REQUIRED);
    }

    const token = generateApiToken();
    const tokenPrefix = getDisplayPrefix(token);
    const tokenHash = await hashApiToken(token);

    const _id = await ctx.db.insert("apiTokens", {
      userId: authUserId,
      name,
      permission: args.permission,
      tokenPrefix,
      tokenHash,
      updatedAt: Date.now(),
    });

    return { _id, token };
  },
});

export const update = mutation({
  args: {
    tokenId: v.id("apiTokens"),
    name: v.optional(v.string()),
    permission: v.optional(apiTokenPermissionValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const authUserId = await requireAuth(ctx);

    const token = await ctx.db.get(args.tokenId);
    if (!token || token.userId !== authUserId) {
      throw new ConvexError(errors.TOKEN_NOT_FOUND);
    }
    if (token.revokedAt !== undefined) {
      throw new ConvexError(errors.TOKEN_REVOKED);
    }

    const patch: { name?: string; permission?: "read" | "write" } = {};
    if (args.name !== undefined) {
      const name = args.name.trim();
      if (!name) {
        throw new ConvexError(errors.TOKEN_NAME_REQUIRED);
      }
      patch.name = name;
    }
    if (args.permission !== undefined) {
      patch.permission = args.permission;
    }

    await ctx.db.patch(args.tokenId, { ...patch, updatedAt: Date.now() });
    return null;
  },
});

export const revoke = mutation({
  args: {
    tokenId: v.id("apiTokens"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const authUserId = await requireAuth(ctx);

    const token = await ctx.db.get(args.tokenId);
    if (!token || token.userId !== authUserId) {
      throw new ConvexError(errors.TOKEN_NOT_FOUND);
    }

    if (token.revokedAt === undefined) {
      await ctx.db.patch(args.tokenId, { revokedAt: Date.now() });
    }
    return null;
  },
});
