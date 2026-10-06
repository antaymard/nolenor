import { saveMessage } from "@convex-dev/agent";
import { v } from "convex/values";
import { components } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { mutation, query, type MutationCtx } from "../_generated/server";
import { requireAuth } from "../lib/auth";
import * as MessageMetadataModels from "../models/messageMetadataModels";
import * as ThreadMetadataModels from "../models/threadMetadataModels";
import { submissionStatuses } from "../schemas/submissionsSchema";

/**
 * Les messages qui arrivent pendant qu'un run travaille (cf.
 * schemas/submissionsSchema.ts). Ce module ne fait que lire et écrire la file ;
 * `tasks.ts` décide quand la vider.
 */

type Submission = Doc<"submissions">;

/** Borne d'un placement : au-delà, le reste attend la génération suivante. */
const PLACE_BATCH = 20;

export async function listQueued(
  ctx: MutationCtx,
  threadId: string,
): Promise<Submission[]> {
  return ctx.db
    .query("submissions")
    .withIndex("by_threadId_and_status", (q) =>
      q.eq("threadId", threadId).eq("status", submissionStatuses.queued),
    )
    .take(PLACE_BATCH);
}

/**
 * Sauve une submission dans le transcript. `as` décide du texte : `content`
 * (texte + contexte) pour un steer placé dans un run en cours, `prompt` pour
 * le message qui ouvre un run — son contexte passe alors par le `llmPrompt`
 * du run, comme pour un envoi direct.
 */
export async function placeSubmission(
  ctx: MutationCtx,
  submission: Submission,
  as: "steer" | "runStart",
): Promise<string> {
  const { messageId } = await saveMessage(ctx, components.agent, {
    threadId: submission.threadId,
    userId: submission.userId,
    prompt: as === "steer" ? submission.content : submission.prompt,
  });
  await recordAttachments(ctx, {
    messageId,
    threadId: submission.threadId,
    userId: submission.userId,
    attachments: submission.attachments,
  });
  await ctx.db.patch("submissions", submission._id, {
    status: submissionStatuses.placed,
    messageId,
  });
  return messageId;
}

export async function recordAttachments(
  ctx: MutationCtx,
  args: {
    messageId: string;
    threadId: string;
    userId: Id<"users">;
    attachments: Submission["attachments"];
  },
) {
  if (!args.attachments) return;
  await MessageMetadataModels.recordUserAttachments(ctx, {
    messageId: args.messageId,
    threadId: args.threadId,
    userId: args.userId,
    attachments: args.attachments,
  });
}

export async function withdrawQueued(ctx: MutationCtx, threadId: string) {
  for (const submission of await listQueued(ctx, threadId)) {
    await ctx.db.patch("submissions", submission._id, {
      status: submissionStatuses.withdrawn,
    });
  }
}

// ── Surface client ─────────────────────────────────────────────────────────

/** Les messages en file d'un thread, pour les bulles « en file ». */
export const listQueuedSubmissions = query({
  args: { threadId: v.string() },
  handler: async (ctx, { threadId }) => {
    const userId = await requireAuth(ctx);
    const row = await ThreadMetadataModels.findByThreadId(ctx, { threadId });
    if (!row || row.userId !== userId) return [];
    const queued = await ctx.db
      .query("submissions")
      .withIndex("by_threadId_and_status", (q) =>
        q.eq("threadId", threadId).eq("status", submissionStatuses.queued),
      )
      .take(PLACE_BATCH);
    return queued.map((submission) => ({
      _id: submission._id,
      _creationTime: submission._creationTime,
      prompt: submission.prompt,
    }));
  },
});

/** Retire un message encore en file. Sans effet s'il a déjà été placé. */
export const withdrawSubmission = mutation({
  args: { submissionId: v.id("submissions") },
  handler: async (ctx, { submissionId }) => {
    const userId = await requireAuth(ctx);
    const submission = await ctx.db.get("submissions", submissionId);
    if (!submission || submission.userId !== userId) return { withdrawn: false };
    if (submission.status !== submissionStatuses.queued) {
      return { withdrawn: false };
    }
    await ctx.db.patch("submissions", submissionId, {
      status: submissionStatuses.withdrawn,
    });
    return { withdrawn: true };
  },
});
