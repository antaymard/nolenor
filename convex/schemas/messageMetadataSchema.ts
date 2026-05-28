import { v } from "convex/values";

const messageMetadataValidator = v.object({
  messageId: v.string(),
  threadId: v.string(),
  userId: v.id("users"),
  role: v.union(v.literal("user"), v.literal("assistant")),
  agentName: v.optional(v.string()),

  // assistant only (filled by usageHandler)
  model: v.optional(v.string()),
  provider: v.optional(v.string()),
  usage: v.optional(v.record(v.string(), v.any())),
  costUsd: v.optional(v.number()),

  // user only (filled by saveMessage)
  attachments: v.optional(
    v.object({
      nodes: v.optional(
        v.array(
          v.object({
            id: v.string(),
            type: v.string(),
            title: v.string(),
          }),
        ),
      ),
      position: v.optional(v.object({ x: v.number(), y: v.number() })),
      page: v.optional(
        v.object({
          title: v.optional(v.string()),
          url: v.optional(v.string()),
        }),
      ),
    }),
  ),
});

export { messageMetadataValidator };
