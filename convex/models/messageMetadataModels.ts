import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { type Usage } from "../ia/helpers/usageHandler";

type MessageMetadata = Doc<"messageMetadata">;

export type AttachmentNodeRef = {
  id: string;
  type: string;
  title: string;
};

export type AttachmentsPayload = {
  nodes?: AttachmentNodeRef[];
  position?: { x: number; y: number };
  page?: { title?: string; url?: string };
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
    !!attachments.position ||
    !!attachments.page;
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
