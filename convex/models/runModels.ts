import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  ACTIVITY_TEXT_MAX_LENGTH,
  RUN_ERROR_MAX_LENGTH,
  type ThreadNodeTouch,
  type ThreadNodeTouchKind,
  type ThreadRunStatus,
} from "../schemas/threadMetadataSchema";

/**
 * Les runs vus comme des tâches (cf. schemas/runsSchema.ts). Toutes les
 * écritures de la table passent par ici.
 */

type Run = Doc<"runs">;

const REQUEST_MAX_LENGTH = 200;

const TOUCH_KIND_RANK: Record<ThreadNodeTouchKind, number> = {
  updated: 0,
  created: 1,
  deleted: 2,
};

export async function findByRunMessageId(
  ctx: QueryCtx | MutationCtx,
  runMessageId: string,
): Promise<Run | null> {
  return ctx.db
    .query("runs")
    .withIndex("by_runMessageId", (q) => q.eq("runMessageId", runMessageId))
    .unique();
}

/** Le run en cours d'un thread, s'il y en a un. */
async function findActiveRun(
  ctx: MutationCtx,
  threadId: string,
): Promise<Run | null> {
  const latest = await ctx.db
    .query("runs")
    .withIndex("by_threadId", (q) => q.eq("threadId", threadId))
    .order("desc")
    .first();
  return latest && latest.endedAt === undefined ? latest : null;
}

export async function createRun(
  ctx: MutationCtx,
  args: {
    threadId: string;
    runMessageId: string;
    canvasId: Id<"canvases">;
    userId: Id<"users">;
    agentName: string;
    profile: string;
    request: string;
  },
): Promise<void> {
  const request = args.request.trim().replace(/\s+/g, " ");
  await ctx.db.insert("runs", {
    ...args,
    request:
      request.length > REQUEST_MAX_LENGTH
        ? `${request.slice(0, REQUEST_MAX_LENGTH)}…`
        : request,
    status: "running",
    startedAt: Date.now(),
  });
}

/** `running` ↔ `waiting` (question posée, puis répondue). */
export async function setRunStatus(
  ctx: MutationCtx,
  runMessageId: string,
  status: Extract<ThreadRunStatus, "running" | "waiting">,
): Promise<void> {
  const run = await findByRunMessageId(ctx, runMessageId);
  if (!run || run.endedAt !== undefined) return;
  await ctx.db.patch("runs", run._id, { status });
}

export async function endRun(
  ctx: MutationCtx,
  runMessageId: string,
  status: Exclude<ThreadRunStatus, "running" | "waiting">,
  error?: string,
): Promise<void> {
  const run = await findByRunMessageId(ctx, runMessageId);
  if (!run || run.endedAt !== undefined) return;
  await ctx.db.patch("runs", run._id, {
    status,
    endedAt: Date.now(),
    ...(error ? { error: error.slice(0, RUN_ERROR_MAX_LENGTH) } : {}),
  });
}

/** La dernière action annoncée par l'agent (l'`explanation` d'un tool). */
export async function recordActivity(
  ctx: MutationCtx,
  runMessageId: string,
  text: string,
): Promise<void> {
  const trimmed = text.trim().slice(0, ACTIVITY_TEXT_MAX_LENGTH);
  if (!trimmed) return;
  const run = await findByRunMessageId(ctx, runMessageId);
  if (!run || run.endedAt !== undefined || run.lastActivity?.text === trimmed) {
    return;
  }
  await ctx.db.patch("runs", run._id, {
    lastActivity: { text: trimmed, at: Date.now() },
  });
}

/** Un node écrit par l'agent pendant le run en cours du thread. */
export async function recordNodeTouch(
  ctx: MutationCtx,
  args: { threadId: string; nodeDataId: Id<"nodeDatas">; kind: ThreadNodeTouchKind },
): Promise<void> {
  const run = await findActiveRun(ctx, args.threadId);
  if (!run) return;
  const touched: ThreadNodeTouch[] = run.touchedNodes ?? [];
  const existing = touched.find((touch) => touch.nodeDataId === args.nodeDataId);
  if (existing && TOUCH_KIND_RANK[args.kind] <= TOUCH_KIND_RANK[existing.kind]) {
    return;
  }
  await ctx.db.patch("runs", run._id, {
    touchedNodes: existing
      ? touched.map((touch) =>
          touch.nodeDataId === args.nodeDataId ? { ...touch, kind: args.kind } : touch,
        )
      : [...touched, { nodeDataId: args.nodeDataId, kind: args.kind, at: Date.now() }],
  });
}

/** Une tâche relue : seulement une fois finie. Rend `true` si elle l'a été. */
export async function markReviewed(
  ctx: MutationCtx,
  run: Run,
): Promise<boolean> {
  if (run.endedAt === undefined || run.reviewedAt !== undefined) return false;
  await ctx.db.patch("runs", run._id, { reviewedAt: Date.now() });
  return true;
}

/** Défait `markReviewed` (le « Undo » de la home). */
export async function unmarkReviewed(
  ctx: MutationCtx,
  run: Run,
): Promise<void> {
  if (run.reviewedAt === undefined) return;
  await ctx.db.patch("runs", run._id, { reviewedAt: undefined });
}

/** Ouvrir la conversation, c'est relire toutes ses tâches finies. */
export async function markThreadReviewed(
  ctx: MutationCtx,
  threadId: string,
): Promise<void> {
  const runs = await ctx.db
    .query("runs")
    .withIndex("by_threadId", (q) => q.eq("threadId", threadId))
    .order("desc")
    .take(50);
  for (const run of runs) await markReviewed(ctx, run);
}

/**
 * L'état de run d'un thread, pour sa pastille : celui du run en cours
 * (`threadMetadata.run`), sinon l'issue du dernier. Un run resté ouvert alors
 * que le thread n'en a plus ne finira jamais : il compte comme interrompu.
 */
export async function threadRunState(
  ctx: QueryCtx,
  row: Doc<"threadMetadata">,
): Promise<{ runStatus: ThreadRunStatus | null; lastRunError: string | null }> {
  if (row.run) {
    return {
      runStatus: row.run.awaitingTaskId ? "waiting" : "running",
      lastRunError: null,
    };
  }
  const last = await ctx.db
    .query("runs")
    .withIndex("by_threadId", (q) => q.eq("threadId", row.threadId))
    .order("desc")
    .first();
  if (!last) return { runStatus: null, lastRunError: null };
  return {
    runStatus: last.endedAt === undefined ? "aborted" : last.status,
    lastRunError: last.error ?? null,
  };
}
