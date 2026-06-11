import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { baseAgent, createWorkerAgent } from "./agents";
import { components, internal } from "../_generated/api";
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
      // Check if the provided canvasId is accessible to the user (only creator for now)
      const isCanvasCreator = await ctx.runQuery(
        internal.wrappers.canvasWrappers.checkCanvasAccessForUser,
        {
          canvasId,
          userId,
        },
      );
      if (!isCanvasCreator)
        throw new Error("User does not have access to this canvas");

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
