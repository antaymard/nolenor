import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { baseAgent, createWorkerAgent } from "./agents";
import { components } from "../_generated/api";
import { createThread } from "@convex-dev/agent";
import generateWorkerSystemPrompt from "./systemPrompts/workerSystemPrompt";

export const startWorkerTask = internalAction({
  args: {
    userId: v.id("users"),
    canvasId: v.id("canvases"),
    instructions: v.string(),
  },
  handler: async (ctx, { userId, canvasId, instructions }) => {
    try {
      const threadId = await createThread(ctx, components.agent, {
        userId,
        title: `__WORKER__`,
      });

      const { messageId } = await baseAgent.saveMessage(ctx, {
        threadId,
        prompt: `${instructions}`,
      });

      const workerAgent = createWorkerAgent({
        threadCtx: {
          authUserId: userId,
          canvasId,
        },
      });

      const workerSystemPrompt = await generateWorkerSystemPrompt({
        ctx,
        canvasId,
        userId,
      });

      const result = await workerAgent.generateText(
        ctx,
        {
          threadId,
          userId,
        },
        {
          prompt: instructions,
          promptMessageId: messageId,
          system: workerSystemPrompt,
        },
      );

      return result.text;
    } catch (error) {
      console.error("Error in startWorkerTask:", error);
      throw error;
    }
  },
});
