import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { baseAgent, chatModelOptions, vChatModelValues } from "./agents";
import { requireAuth, requireCanvasAccess } from "../lib/auth";
import { startRun } from "../harness/tasks";
import { noleProfile, type NoleRunInput } from "./profiles/nole";
import * as MessageMetadataModels from "../models/messageMetadataModels";
import { enforceRateLimit } from "../lib/rateLimits";

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

    // Un message = un run d'agent complet, donc de l'argent réel. C'est la
    // surface la plus chère de l'app et elle n'avait aucune borne.
    await enforceRateLimit(ctx, "noleMessage", authUserId);

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
      await MessageMetadataModels.recordUserAttachments(ctx, {
        messageId: messageId,
        threadId,
        userId: authUserId,
        attachments: { nodes, position },
      });
    }

    // 3) Ouvrir le run : statut `running` dans cette transaction (toutes les
    // surfaces voient le thread travailler dès l'envoi), première génération
    // planifiée. Cf. convex/harness.
    await startRun(ctx, {
      threadId,
      userId: authUserId,
      canvasId,
      startMessageId: messageId,
      profile: noleProfile,
      model: metadata?.model,
      input: { userPrompt: prompt, metadata } satisfies NoleRunInput,
    });

    return { messageId };
  },
});
