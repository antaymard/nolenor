import { internal } from "../../_generated/api";

export type Usage = {
  inputTokens?: number;
  inputTokenDetails?: object;
  outputTokens?: number;
  outputTokenDetails?: object;
  totalTokens?: number;
  cachedInputTokens?: number;
  reasoningTokens?: number;
  cost?: number;
};

export async function recordAssistantUsage(ctx: any, args: any) {
  const {
    userId,
    threadId,
    agentName,
    model,
    provider,
    usage,
    // providerMetadata,
  } = args;

  // Format the usage data as needed for storage
  const usageData: Usage = {
    inputTokens: usage.inputTokens,
    inputTokenDetails: usage.inputTokenDetails,
    outputTokens: usage.outputTokens,
    outputTokenDetails: usage.outputTokenDetails,
    totalTokens: usage.totalTokens,
    cachedInputTokens: usage.cachedInputTokens,
    reasoningTokens: usage.reasoningTokens,
    cost: usage.raw.cost,
  };

  //   Create the messageMetadataObject
  const messageMetadata = {
    userId,
    agentName,
    threadId,
    model,
    provider,
    usage: usageData,
  };

  await ctx.runMutation(
    internal.wrappers.messageMetadataWrappers.recordAssistantUsage,
    messageMetadata,
  );
}
