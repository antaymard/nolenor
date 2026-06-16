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

export async function recordUsageInThreadMetadata(ctx: any, args: any) {
  const { threadId, usage } = args;

  // Get the current thread metadata
  const threadMetadata = await ctx.runQuery(
    internal.wrappers.threadMetadataWrappers.read,
    { threadId },
  );

  // ThreadMetadata should be created when the thread is created, so if it's not found, we log a warning and skip updating usage
  if (!threadMetadata) {
    console.warn(
      `Thread metadata not found for threadId: ${threadId}. Cannot update usage.`,
    );
    return;
  }

  // Get the touchedNodeDataIds from the last message

  // Update the total usage in thread metadata
  await ctx.runMutation(internal.wrappers.threadMetadataWrappers.updateUsage, {
    threadId,
    additionalUsageUsd: usage.raw.cost || 0, // Use the cost from usage data, default to 0 if not available
  });
}
