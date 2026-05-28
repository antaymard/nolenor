import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import * as MessageMetadataModels from "../models/messageMetadataModels";

export const recordAssistantUsage = internalMutation({
  args: {
    userId: v.id("users"),
    agentName: v.string(),
    threadId: v.string(),
    model: v.optional(v.string()),
    provider: v.optional(v.string()),
    usage: v.record(v.string(), v.any()),
  },
  handler: async (ctx, args) =>
    MessageMetadataModels.recordAssistantUsage(ctx, args),
});
