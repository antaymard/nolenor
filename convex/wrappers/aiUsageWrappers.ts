import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { vAiUsageSource } from "../schemas/aiUsageSourceSchema";
import { aiUsageTokensValidator } from "../schemas/aiUsageTokensSchema";
import * as AiUsageModels from "../models/aiUsageModels";

/**
 * Point d'entrée unique de la comptabilité d'usage IA, appelé par le
 * `usageHandler` partagé (cf. ia/usage.ts) une fois par step LLM.
 *
 * `userId` est une `v.string()` et non un `v.id("users")` : le composant agent
 * transmet une chaîne nue. La normalisation, et le repli sur le thread quand
 * elle échoue, se font dans le modèle.
 */
export const recordUsage = internalMutation({
  args: {
    source: vAiUsageSource,
    userId: v.optional(v.string()),
    threadId: v.optional(v.string()),
    agentName: v.optional(v.string()),
    model: v.string(),
    provider: v.string(),
    // Absent = OpenRouter n'a renvoyé aucun coût, à ne pas confondre avec 0.
    costUsd: v.optional(v.number()),
    upstreamCostUsd: v.optional(v.number()),
    tokens: aiUsageTokensValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => AiUsageModels.recordUsage(ctx, args),
});
