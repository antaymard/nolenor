import { v } from "convex/values";
import { getToolName, isToolUIPart } from "ai";
import { createThread, listUIMessages } from "@convex-dev/agent";
import { action } from "../_generated/server";
import { components, internal } from "../_generated/api";
import { requireAuth } from "../lib/auth";
import { baseAgent, defaultChatModelValue, vChatModelValues } from "./agents";

// Runs a single isolated turn of Nolë against the real production entry point
// (internal.ia.noleCompletion.streamResponse), for offline evals (see evals/).
// Not used by the app UI — called by the Braintrust eval script, authenticated
// as a dedicated eval-bot account (see evals/convexAuthClient.ts).
export const runEvalTurn = action({
  args: {
    canvasId: v.id("canvases"),
    prompt: v.string(),
    model: v.optional(vChatModelValues),
  },
  returns: v.object({
    text: v.string(),
    model: v.string(),
    usageUsd: v.number(),
    toolCalls: v.array(
      v.object({
        toolName: v.string(),
        input: v.any(),
        output: v.any(),
      }),
    ),
    visibleNodeIds: v.array(v.string()),
  }),
  handler: async (ctx, { canvasId, prompt, model }) => {
    const authUserId = await requireAuth(ctx);

    const hasAccess = await ctx.runQuery(
      internal.wrappers.canvasWrappers.checkCanvasAccessForUser,
      { canvasId, userId: authUserId },
    );
    if (!hasAccess) {
      throw new Error(`User does not have access to canvas "${canvasId}".`);
    }

    // Snapshot before the turn runs, for the eval's hallucination-check scorer.
    const { nodes } = await ctx.runQuery(
      internal.wrappers.canvasNodeWrappers.getCanvasNodesAndEdges,
      { canvasId },
    );
    const visibleNodeIds = nodes.map((node) => node.id);

    const threadId = await createThread(ctx, components.agent, {
      userId: authUserId,
      title: "__EVAL__",
    });

    // createNoleAgent's usageHandler (see agents.ts) updates threadMetadata on
    // every step and throws if this row doesn't exist yet.
    await ctx.runMutation(internal.wrappers.threadMetadataWrappers.create, {
      threadId,
      canvasId,
      userId: authUserId,
      agentName: "Nolë",
    });

    const { messageId } = await baseAgent.saveMessage(ctx, {
      threadId,
      prompt,
    });

    await ctx.runAction(internal.ia.noleCompletion.streamResponse, {
      authUserId,
      threadId,
      promptMessageId: messageId,
      userPrompt: prompt,
      metadata: model ? { model } : undefined,
      canvasId,
    });

    const { page } = await listUIMessages(ctx, components.agent, {
      threadId,
      paginationOpts: { cursor: null, numItems: 50 },
    });
    const assistantMessages = page.filter((m) => m.role === "assistant");
    const assistantMessage = assistantMessages[assistantMessages.length - 1];

    const toolCalls = (assistantMessage?.parts ?? [])
      .filter(isToolUIPart)
      .map((part) => ({
        toolName: getToolName(part),
        input: "input" in part ? part.input : undefined,
        output: "output" in part ? part.output : undefined,
      }));

    const threadMetadata = await ctx.runQuery(
      internal.wrappers.threadMetadataWrappers.read,
      { threadId },
    );

    return {
      text: assistantMessage?.text ?? "",
      model: model ?? defaultChatModelValue,
      usageUsd: threadMetadata?.totalUsageUsd ?? 0,
      toolCalls,
      visibleNodeIds,
    };
  },
});
