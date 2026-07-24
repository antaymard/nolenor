import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { baseAgent, chatModelOptions, vChatModelValues } from "./agents";
import { requireAuth, requireCanvasAccess } from "../lib/auth";
import { internal } from "../_generated/api";
import * as MessageMetadataModels from "../models/messageMetadataModels";

export const vMetadata = v.optional(
  v.object({
    messageContext: v.optional(v.any()),
    model: v.optional(vChatModelValues),
  }),
);

export type NoleMessageMetadata = typeof vMetadata.type;

export const listChatModels = query({
  args: {},
  handler: async () => {
    return chatModelOptions;
  },
});

// Public entrypoint: persist user message, then schedule async streaming.
export const saveMessage = mutation({
  args: {
    threadId: v.string(),
    prompt: v.string(),
    metadata: vMetadata,
    canvasId: v.id("canvases"),
  },
  handler: async (ctx, { threadId, prompt, metadata, canvasId }) => {
    const authUserId = await requireAuth(ctx);

    // The full agent toolset includes canvas write tools, so we require editor
    // access up front (matching the worker path). Without this, an authenticated
    // user could point the agent at any canvas id they know.
    await requireCanvasAccess(ctx, canvasId, authUserId, "editor");

    // 1) Persist the user message first so it exists in thread history.
    const { messageId } = await baseAgent.saveMessage(ctx, {
      threadId,
      prompt,
    });

    // 2) Persist user-side metadata (attachments) extracted from messageContext.
    const messageContext = metadata?.messageContext;
    if (
      messageContext &&
      typeof messageContext === "object" &&
      !Array.isArray(messageContext)
    ) {
      const mc = messageContext as Record<string, unknown>;
      const attachedNodesRaw = Array.isArray(mc.attachedNodes)
        ? (mc.attachedNodes as Array<Record<string, unknown>>)
        : [];
      const nodes = attachedNodesRaw
        .filter(
          (n) =>
            typeof n.id === "string" &&
            typeof n.type === "string" &&
            typeof n.title === "string",
        )
        .map((n) => ({
          id: n.id as string,
          type: n.type as string,
          title: n.title as string,
        }));
      const position =
        mc.attachedPosition &&
        typeof mc.attachedPosition === "object" &&
        typeof (mc.attachedPosition as Record<string, unknown>).x ===
          "number" &&
        typeof (mc.attachedPosition as Record<string, unknown>).y === "number"
          ? {
              x: (mc.attachedPosition as { x: number }).x,
              y: (mc.attachedPosition as { y: number }).y,
            }
          : undefined;
      const pageRaw =
        mc.attachedPage && typeof mc.attachedPage === "object"
          ? (mc.attachedPage as Record<string, unknown>)
          : undefined;
      const page = pageRaw
        ? {
            title:
              typeof pageRaw.title === "string" ? pageRaw.title : undefined,
            url: typeof pageRaw.url === "string" ? pageRaw.url : undefined,
          }
        : undefined;

      await MessageMetadataModels.recordUserAttachments(ctx, {
        messageId: messageId,
        threadId,
        userId: authUserId,
        attachments: { nodes, position, page },
      });
    }

    // 3) Schedule the response generation in background.
    void ctx.scheduler.runAfter(0, internal.ia.noleCompletion.streamResponse, {
      authUserId: authUserId,
      threadId,
      promptMessageId: messageId,
      userPrompt: prompt,
      metadata,
      canvasId,
    });

    return { messageId };
  },
});
