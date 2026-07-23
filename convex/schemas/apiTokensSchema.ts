import { v } from "convex/values";

const apiTokenPermissionValidator = v.union(
  v.literal("read"),
  v.literal("write"),
);

const apiTokensValidator = v.object({
  userId: v.id("users"),
  name: v.string(),
  permission: apiTokenPermissionValidator,
  // Non-secret, safe to display for identification (e.g. "nlnr_Ab3dEfGh…").
  tokenPrefix: v.string(),
  // SHA-256 hex digest of the full token. The plaintext is never stored.
  tokenHash: v.string(),
  updatedAt: v.number(),
  // Reserved for the future MCP/API verifier; unused by token management itself.
  lastUsedAt: v.optional(v.number()),
  // Soft-revoke marker. undefined = active.
  revokedAt: v.optional(v.number()),
});

export { apiTokenPermissionValidator, apiTokensValidator };
