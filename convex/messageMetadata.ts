import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireAuth } from "./lib/auth";
import { components } from "./_generated/api";
import { getThreadMetadata } from "@convex-dev/agent";
import * as MessageMetadataModels from "./models/messageMetadataModels";
import * as ThreadMetadataModels from "./models/threadMetadataModels";
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

    // Thread-level cost is accumulated in threadMetadata (agent usageHandler),
    // not derived per message.
    const threadMetadata = await ThreadMetadataModels.findByThreadId(ctx, {
      threadId,
    });
    const totalCostUsd = threadMetadata?.totalUsageUsd ?? 0;

    // Per-message usage/model come from messageMetadata. Derive last model used
    // and the current context window from the latest assistant row.
    const assistantMessageMetadatas = messageMetadata.filter(
      (m) => m.role === "assistant",
    );
    const lastAssistantMessageMetadata =
      assistantMessageMetadatas.length > 0
        ? assistantMessageMetadatas[assistantMessageMetadatas.length - 1]
        : null;

    const lastModelUsed = lastAssistantMessageMetadata?.model ?? null;
    const contextWindowUsed =
      lastAssistantMessageMetadata?.usage?.totalTokens ?? null;

    return {
      totalCostUsd,
      lastModelUsed,
      contextWindowUsed,
      messageMetadata,
    };
  },
});
