"use node";
import { v } from "convex/values";

import { internalAction } from "../_generated/server";
import { createNoleAgent, getChatModel } from "./agents";
import { generateNoleSystemPrompt } from "./systemPrompts/noleSystemPrompt";
import { components, internal } from "../_generated/api";
import { generateMessageContext } from "./helpers/generateMessageContext";
import { Composio } from "@composio/core";
import { VercelProvider } from "@composio/vercel";
import { vMetadata } from "./nole";
import { sanitizeComposioTools } from "./helpers/composioSanitizer";

function isExpectedAbortedStreamError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("stream") &&
    message.includes("aborted") &&
    (message.includes("trying to finish") || message.includes("finish"))
  );
}

// Internal action that handles streaming
export const streamResponse = internalAction({
  args: {
    authUserId: v.id("users"),
    promptMessageId: v.string(),
    userPrompt: v.string(),
    threadId: v.string(),
    metadata: vMetadata,
    canvasId: v.id("canvases"),
  },
  handler: async (
    ctx,
    { authUserId, promptMessageId, userPrompt, threadId, metadata, canvasId },
  ) => {
    // A) Build system prompt (long-lived context for this run).
    const noleSystemPrompt = await generateNoleSystemPrompt({
      canvasId,
      userId: authUserId,
      ctx,
    });

    // Init composio
    let composioTools = {};
    try {
      const composio = new Composio({ provider: new VercelProvider() });
      const session = await composio.create(authUserId);
      composioTools = sanitizeComposioTools(await session.tools());
    } catch (error) {
      console.warn(
        "Composio unavailable, continuing without external tools:",
        error,
      );
    }

    // Create agents and give it extra tools
    const noleAgent = createNoleAgent({
      model: metadata?.model ? getChatModel(metadata.model) : undefined,
      threadCtx: {
        authUserId,
        canvasId,
      },
      extraTools: composioTools,
    });

    // B) Retrieve the immediately previous message in the thread.
    // We request two messages including `promptMessageId`, then keep the other one.
    const previousMessages = await ctx.runQuery(
      components.agent.messages.listMessagesByThreadId,
      {
        threadId,
        order: "desc",
        excludeToolMessages: true,
        upToAndIncludingMessageId: promptMessageId,
        paginationOpts: {
          cursor: null,
          numItems: 2,
        },
      },
    );

    const previousMessage = previousMessages.page.find(
      (message) => message._id !== promptMessageId,
    );

    // C) Compute canvas changes since that previous message.
    // This is runtime-only context injected into the current prompt (not persisted).
    const canvasChangesSinceLastMessage = previousMessage
      ? await ctx.runQuery(
          internal.ia.helpers.getCanvasChangesSinceLastMessage
            .getCanvasChangesSinceLastMessage,
          {
            canvasId,
            lastMessageAt: previousMessage._creationTime,
          },
        )
      : "";

    // D) Merge optional message metadata + computed canvas changes context.
    const generatedMessageContext = generateMessageContext({
      metadata,
      canvasChangesSinceLastMessage,
    });

    // E) Build final user prompt payload.
    const llmPrompt = generatedMessageContext
      ? `${generatedMessageContext}\n\n<user_message>\n${userPrompt}\n</user_message>`
      : userPrompt;

    try {
      // F) Stream assistant response and persist deltas progressively.
      const result = await noleAgent.streamText(
        ctx,
        { threadId, userId: authUserId },
        {
          promptMessageId,
          prompt: llmPrompt,
          system: noleSystemPrompt,
        },
        {
          saveStreamDeltas: {
            chunking: "word", // Stream word by word
            throttleMs: 200, // 200ms between each update
          },
        },
      );

      // Ensure the stream is fully consumed to completion.
      await result.consumeStream();
      const totalUsage = await result.totalUsage;
      console.log("_totalUsage", totalUsage);
    } catch (error) {
      if (isExpectedAbortedStreamError(error)) {
        return null;
      }
      throw error;
    }

    return null;
  },
});
