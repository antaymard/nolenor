"use node";
import {v, ConvexError} from "convex/values";
import {internalAction} from "../_generated/server";
import {baseAgent, createWorkerAgent} from "./agents";
import {components, internal} from "../_generated/api";
import {createThread} from "@convex-dev/agent";
import generateWorkerSystemPrompt from "./systemPrompts/workerSystemPrompt";
import {type Id} from "../_generated/dataModel";
import {asSubAgentErrorData, subAgentConvexError} from "./subAgentErrors";

export const startWorkerTask = internalAction({
  args: {
    userId: v.id("users"),
    // Validated below instead of via `v.id` so a malformed id surfaces as a
    // classified `invalid_arguments` error we control, rather than an
    // ArgumentValidationError that gets redacted to "Server Error" as it
    // crosses back to the parent tool.
    canvasId: v.string(),
    instructions: v.string(),
  },
  handler: async (ctx, { userId, canvasId, instructions }) => {
    // --- Phase 1: authorize the target canvas -----------------------------
    // A malformed id trips the query's `v.id` validator (→ invalid_arguments);
    // a valid-but-unauthorized id returns false (→ access_denied).
    let hasAccess: boolean;
    try {
      hasAccess = await ctx.runQuery(
        internal.wrappers.canvasWrappers.checkCanvasAccessForUser,
        {
          canvasId: canvasId as Id<"canvases">,
          userId,
        },
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.error("[startWorkerTask] invalid canvasId", {
        canvasId,
        userId,
        detail,
      });
      throw subAgentConvexError(
        "invalid_arguments",
        `canvasId "${canvasId}" is not a valid canvas id.`,
      );
    }

    if (!hasAccess) {
      console.warn("[startWorkerTask] canvas access denied", {
        canvasId,
        userId,
      });
      throw subAgentConvexError(
        "access_denied",
        `User does not have access to canvas "${canvasId}".`,
      );
    }

    // --- Phase 2: run the worker ------------------------------------------
    // Anything thrown here is a worker/infra failure, not an argument problem
    // the caller can fix, so it is reported as `worker_execution`.
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
          canvasId: canvasId as Id<"canvases">,
        },
      });

      const workerSystemPrompt = await generateWorkerSystemPrompt({
        ctx,
        canvasId: canvasId as Id<"canvases">,
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
      // Preserve an already-classified error untouched (defensive — phase 2
      // does not throw these itself), otherwise wrap the real reason so it
      // survives the ctx.runAction boundary as a worker execution failure.
      if (error instanceof ConvexError && asSubAgentErrorData(error.data)) {
        throw error;
      }
      const detail = error instanceof Error ? error.message : String(error);
      console.error("[startWorkerTask] worker execution failed", {
        canvasId,
        userId,
        detail,
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw subAgentConvexError("worker_execution", detail);
    }
  },
});
