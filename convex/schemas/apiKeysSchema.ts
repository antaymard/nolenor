import { v } from "convex/values";

// Clés API personnelles (serveur MCP). La clé n'est jamais stockée en clair :
// seul son hash SHA-256 (hex) est persisté, plus un préfixe pour l'affichage.
const apiKeysValidator = v.object({
  userId: v.id("users"),
  name: v.string(),
  keyHash: v.string(),
  prefix: v.string(),
  lastUsedAt: v.optional(v.number()),
  revokedAt: v.optional(v.number()),
});

export { apiKeysValidator };
