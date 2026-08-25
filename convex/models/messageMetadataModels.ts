import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type Usage = {
  inputTokens?: number;
  inputTokenDetails?: object;
  outputTokens?: number;
  outputTokenDetails?: object;
  totalTokens?: number;
  cachedInputTokens?: number;
  reasoningTokens?: number;
  cost?: number;
};

type MessageMetadata = Doc<"messageMetadata">;

export type AttachmentNodeRef = {
  id: string;
  type: string;
  title: string;
};

export type AttachmentsPayload = {
  nodes?: AttachmentNodeRef[];
  position?: { x: number; y: number };
};

export type UsagePayload = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cachedInputTokens?: number;
};

export async function listByThreadId(
  ctx: QueryCtx,
  { threadId }: { threadId: string },
): Promise<MessageMetadata[]> {
  return await ctx.db
    .query("messageMetadata")
    .withIndex("by_threadId", (q) => q.eq("threadId", threadId))
    .collect();
}

/**
 * Les `limit` dernières lignes du thread, la plus récente d'abord.
 *
 * Existe pour que le résumé d'usage (cf. messageMetadata.ts) puisse retrouver
 * le dernier modèle utilisé sans lire tout le thread : cette query-là est
 * réévaluée à chaque step de génération, et un `collect()` complet y coûterait
 * O(longueur du thread) lectures vingt-cinq fois par tour. Borner le scan borne
 * aussi le read set, donc les invalidations : une ligne ancienne qui changerait
 * ne réveille plus l'appelant.
 */
export async function listRecentByThreadId(
  ctx: QueryCtx,
  { threadId, limit }: { threadId: string; limit: number },
): Promise<MessageMetadata[]> {
  return await ctx.db
    .query("messageMetadata")
    .withIndex("by_threadId", (q) => q.eq("threadId", threadId))
    .order("desc")
    .take(limit);
}

async function findByMessageId(
  ctx: QueryCtx,
  { messageId }: { messageId: string },
): Promise<MessageMetadata | null> {
  return await ctx.db
    .query("messageMetadata")
    .withIndex("by_messageId", (q) => q.eq("messageId", messageId))
    .unique();
}

// Called when a user sends a message with attachments
export async function recordUserAttachments(
  ctx: MutationCtx,
  {
    messageId,
    threadId,
    attachments,
    userId,
  }: {
    messageId: string;
    threadId: string;
    attachments: AttachmentsPayload;
    userId: Id<"users">;
  },
): Promise<void> {
  const hasAny =
    (attachments.nodes && attachments.nodes.length > 0) ||
    !!attachments.position;
  if (!hasAny) return;

  const existing = await findByMessageId(ctx, { messageId });
  if (existing) {
    await ctx.db.patch(existing._id, { attachments });
    return;
  }

  await ctx.db.insert("messageMetadata", {
    messageId,
    threadId,
    userId,
    role: "user",
    attachments,
  });
}

// Called once per assistant turn, after the stream completes, with usage/cost
// aggregated across the turn's steps and `order` matching the visible message.
export async function recordAssistantUsage(
  ctx: MutationCtx,
  {
    userId,
    agentName,
    threadId,
    messageId,
    model,
    provider,
    usage,
    costUsd,
    order,
  }: {
    userId: Id<"users">;
    agentName: string;
    threadId: string;
    messageId: string;
    model?: string;
    provider?: string;
    usage: Usage;
    costUsd?: number;
    order?: number;
  },
) {
  return await ctx.db.insert("messageMetadata", {
    userId,
    agentName,
    threadId,
    role: "assistant",
    messageId,
    model,
    provider,
    usage,
    costUsd,
    order,
  });
}
