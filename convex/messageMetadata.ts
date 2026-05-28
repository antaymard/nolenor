import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireAuth } from "./lib/auth";
import { components } from "./_generated/api";
import { getThreadMetadata } from "@convex-dev/agent";
import * as MessageMetadataModels from "./models/messageMetadataModels";
import errors from "./config/errorsConfig";

export const getThreadMessageMetadata = query({
  args: { threadId: v.string() },
  handler: async (ctx, { threadId }) => {
    const authUserId = await requireAuth(ctx);

    const thread = await getThreadMetadata(ctx, components.agent, {
      threadId,
    });
    if (!thread || thread.userId !== authUserId) {
      throw new Error(errors.THREAD_NOT_FOUND_OR_FORBIDDEN);
    }

    const messageMetadata = await MessageMetadataModels.listByThreadId(ctx, {
      threadId,
    });

    // Prepare
    const assistantMessageMetadatas = messageMetadata.filter(
      (m) => m.role === "assistant",
    );
    const lastAssistantMessageMetadata =
      assistantMessageMetadatas.length > 0
        ? assistantMessageMetadatas[assistantMessageMetadatas.length - 1]
        : null;

    let totalCostUsd: number;
    let lastModelUsed: string | null | undefined;
    let contextWindowUsed: number | null;

    // Calculate costs and context
    if (!lastAssistantMessageMetadata) {
      totalCostUsd = 0;
      lastModelUsed = null;
      contextWindowUsed = null;
    } else {
      // Calculate total cost for the thread (only from assistant metadata)
      totalCostUsd = assistantMessageMetadatas.reduce(
        (sum, m) => sum + (m.costUsd ?? 0),
        0,
      );

      // Get the last model used
      lastModelUsed = lastAssistantMessageMetadata
        ? lastAssistantMessageMetadata.model
        : null;

      // Get the used context window
      contextWindowUsed = lastAssistantMessageMetadata
        ? lastAssistantMessageMetadata.usage?.totalTokens
        : null;
    }

    console.log({
      totalCostUsd,
      lastModelUsed,
      contextWindowUsed,
    });

    return {
      totalCostUsd,
      lastModelUsed,
      contextWindowUsed,
      messageMetadata,
    };
  },
});
