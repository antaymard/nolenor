import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { chatModelOptions, vChatModelValues } from "./agents";
import { requireAuth, requireCanvasAccess } from "../lib/auth";
import {
  dispatchRequest,
  redispatchAsNew as redispatchAsNewRequest,
} from "../harness/dispatch";
import { setRunModel, submitToThread } from "../harness/tasks";
import * as ThreadMetadataModels from "../models/threadMetadataModels";
import {
  noleMessageContent,
  noleProfile,
  type NoleRunInput,
} from "./profiles/nole";
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

// Point d'entrée public : un message de l'utilisateur à Nolë.
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

    // Le message part par la harness : il ouvre un run si le thread est au
    // repos, sinon il attend sa place dans le run en cours (steer).
    const result = await submitToThread(ctx, {
      threadId,
      userId: authUserId,
      canvasId,
      profile: noleProfile,
      prompt,
      content: noleMessageContent(prompt, metadata),
      input: { userPrompt: prompt, metadata } satisfies NoleRunInput,
      model: metadata?.model,
      attachments: readAttachments(metadata),
    });

    if ("answered" in result) {
      return { messageId: null, queued: false, answered: true };
    }
    return result.queued
      ? { messageId: null, queued: true, answered: false }
      : { messageId: result.messageId, queued: false, answered: false };
  },
});

/**
 * Point d'entrée public sans thread : l'omnibar. La demande est aiguillée
 * vers le thread qui la concerne — en cours, en attente d'une réponse, ou au
 * repos — ou vers un nouveau thread (cf. harness/dispatch.ts). `forceNew` :
 * l'utilisateur veut une nouvelle tâche, sans aiguillage.
 */
export const submit = mutation({
  args: {
    canvasId: v.id("canvases"),
    prompt: v.string(),
    metadata: vMetadata,
    forceNew: v.optional(v.boolean()),
  },
  handler: async (ctx, { canvasId, prompt, metadata, forceNew }) => {
    const authUserId = await requireAuth(ctx);
    await enforceRateLimit(ctx, "noleMessage", authUserId);
    await requireCanvasAccess(ctx, canvasId, authUserId, "editor");

    const attachments = readAttachments(metadata);
    const dispatchId = await dispatchRequest(ctx, {
      canvasId,
      userId: authUserId,
      profile: noleProfile,
      prompt,
      content: noleMessageContent(prompt, metadata),
      input: { userPrompt: prompt, metadata } satisfies NoleRunInput,
      model: metadata?.model,
      attachments,
      nodeIds: requestNodeIds(prompt, attachments),
      forceNew,
    });
    return { dispatchId };
  },
});

/** « Start a new task instead », depuis la ligne « Added to … » de l'omnibar. */
export const redispatchAsNew = mutation({
  args: { dispatchId: v.id("dispatches") },
  handler: async (ctx, { dispatchId }) => {
    const authUserId = await requireAuth(ctx);
    return { redirected: await redispatchAsNewRequest(ctx, dispatchId, authUserId) };
  },
});

/** Les nodes joints au message, puis ceux mentionnés dans son texte. */
function requestNodeIds(
  prompt: string,
  attachments: ReturnType<typeof readAttachments>,
): string[] {
  const ids = new Set(attachments?.nodes?.map((node) => node.id) ?? []);
  for (const match of prompt.matchAll(/\[\[node:([A-Za-z0-9]+)/g)) {
    ids.add(match[1]);
  }
  return [...ids];
}

/**
 * Change le modèle du run en cours, depuis le sélecteur : la génération
 * suivante le prend. Au repos, rien à faire ici — le modèle part avec le
 * prochain message.
 */
export const setCurrentRunModel = mutation({
  args: { threadId: v.string(), model: vChatModelValues },
  handler: async (ctx, { threadId, model }) => {
    const authUserId = await requireAuth(ctx);
    const row = await ThreadMetadataModels.findByThreadId(ctx, { threadId });
    if (!row || row.userId !== authUserId) return { updated: false };
    return { updated: await setRunModel(ctx, threadId, model) };
  },
});

/** Les pièces jointes d'un message, extraites de son `messageContext`. */
function readAttachments(metadata: NoleMessageMetadata) {
  const messageContext = metadata?.messageContext;
  if (
    !messageContext ||
    typeof messageContext !== "object" ||
    Array.isArray(messageContext)
  ) {
    return undefined;
  }
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
    typeof (mc.attachedPosition as Record<string, unknown>).x === "number" &&
    typeof (mc.attachedPosition as Record<string, unknown>).y === "number"
      ? {
          x: (mc.attachedPosition as { x: number }).x,
          y: (mc.attachedPosition as { y: number }).y,
        }
      : undefined;
  return { nodes, position };
}
