import {
  createThread,
  getThreadMetadata,
  type MessageDoc,
} from "@convex-dev/agent";
import { v } from "convex/values";
import { components, internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import * as NodeModels from "../models/nodeModels";
import * as ThreadMetadataModels from "../models/threadMetadataModels";
import { dispatchStatuses } from "../schemas/dispatchesSchema";
import { getProfile } from "./profiles";
import { submitToThread } from "./tasks";
import { userText } from "./transcript";
import type { DispatchCandidate, Profile } from "./types";

/**
 * Le threadless : une demande arrive sans thread (l'omnibar), et la harness
 * choisit où elle va.
 *
 * 1. `dispatchRequest` l'enregistre (`dispatches`, statut `routing`) et
 *    planifie l'aiguillage ;
 * 2. `route` réunit les candidats — les threads récents du canvas — et
 *    demande au routeur du profil lequel la traite (Jev pour Nolë) ;
 * 3. `finalize` l'envoie au thread choisi par `submitToThread`, qui fait le
 *    reste : steer d'un run en cours, réponse à sa question, nouveau run sur
 *    un thread au repos. Aucun thread choisi : un nouveau thread, en
 *    parallèle des autres.
 *
 * Dans le doute, toujours un nouveau thread : pas de candidat, confiance
 * basse, routeur en panne. Une demande n'est jamais perdue ni bloquée par
 * l'aiguillage — un filet planifié la finalise si `route` n'a pas répondu.
 */

/** Fenêtre des candidats : threads actifs depuis moins de 7 jours, 20 au plus. */
const CANDIDATE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_CANDIDATES = 20;
const THREAD_SCAN_LIMIT = 30;
/** En dessous, le routeur hésite : nouveau thread. */
const MIN_CONFIDENCE = 0.5;
/** Le filet : au-delà, la demande part dans un nouveau thread. */
const ROUTING_DEADLINE_MS = 30_000;

const RECENT_REQUESTS = 3;
const REQUEST_CHARS = 300;
const TOUCHED_NODES = 15;
const SUMMARY_CHARS = 600;

const vReason = v.union(
  v.literal("router"),
  v.literal("no_candidates"),
  v.literal("low_confidence"),
  v.literal("router_error"),
  v.literal("forced_new"),
);

/** Le point d'entrée d'une demande sans thread. */
export async function dispatchRequest(
  ctx: MutationCtx,
  args: {
    canvasId: Id<"canvases">;
    userId: Id<"users">;
    profile: Pick<Profile, "name">;
    prompt: string;
    content: string;
    input: unknown;
    model?: string;
    attachments?: unknown;
    nodeIds: string[];
    forceNew?: boolean;
  },
): Promise<Id<"dispatches">> {
  const dispatchId = await ctx.db.insert("dispatches", {
    canvasId: args.canvasId,
    userId: args.userId,
    profile: args.profile.name,
    status: dispatchStatuses.routing,
    prompt: args.prompt,
    content: args.content,
    input: args.input,
    ...(args.model !== undefined ? { model: args.model } : {}),
    ...(args.attachments !== undefined ? { attachments: args.attachments } : {}),
    nodeIds: args.nodeIds,
    ...(args.forceNew ? { forceNew: true } : {}),
  });
  await ctx.scheduler.runAfter(0, internal.harness.dispatch.route, {
    dispatchId,
  });
  await ctx.scheduler.runAfter(
    ROUTING_DEADLINE_MS,
    internal.harness.dispatch.finalize,
    { dispatchId, threadId: null, reason: "router_error" },
  );
  return dispatchId;
}

function truncate(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

async function recentRequests(ctx: QueryCtx, threadId: string) {
  const page: { page: MessageDoc[] } = await ctx.runQuery(
    components.agent.messages.listMessagesByThreadId,
    {
      threadId,
      order: "desc",
      excludeToolMessages: true,
      paginationOpts: { cursor: null, numItems: 12 },
    },
  );
  return page.page
    .filter((doc) => doc.message?.role === "user")
    .map(userText)
    // Les rapports de sous-agents ne sont pas des demandes de l'utilisateur.
    .filter((text) => text && !text.startsWith("<subagent_result"))
    .slice(0, RECENT_REQUESTS)
    .map((text) => truncate(text, REQUEST_CHARS));
}

async function pendingQuestion(
  ctx: QueryCtx,
  taskId: Id<"agentTasks">,
): Promise<string | undefined> {
  const task = await ctx.db.get("agentTasks", taskId);
  const questions = (task?.input as { questions?: unknown } | undefined)
    ?.questions;
  if (!Array.isArray(questions)) return undefined;
  return questions
    .map((q) => (q as { question?: unknown }).question)
    .filter((q): q is string => typeof q === "string")
    .join(" / ");
}

async function describeCandidate(
  ctx: QueryCtx,
  row: Doc<"threadMetadata">,
): Promise<DispatchCandidate> {
  const thread = await getThreadMetadata(ctx, components.agent, {
    threadId: row.threadId,
  }).catch(() => null);

  const touchedNodeIds: string[] = [];
  for (const touch of row.touchedNodes ?? []) {
    if (touchedNodeIds.length >= TOUCHED_NODES) break;
    if (touch.kind === "deleted") continue;
    const node = await NodeModels.getNodeByNodeDataId(ctx, {
      nodeDataId: touch.nodeDataId,
    });
    if (node) touchedNodeIds.push(node.id);
  }

  const compaction = await ctx.db
    .query("compactions")
    .withIndex("by_threadId", (q) => q.eq("threadId", row.threadId))
    .order("desc")
    .first();
  const question = row.run?.awaitingTaskId
    ? await pendingQuestion(ctx, row.run.awaitingTaskId)
    : undefined;

  return {
    threadId: row.threadId,
    title: thread?.title?.trim() || null,
    status: row.run ? (row.run.awaitingTaskId ? "waiting" : "running") : "idle",
    ...(question ? { pendingQuestion: question } : {}),
    recentRequests: await recentRequests(ctx, row.threadId),
    touchedNodeIds,
    ...(compaction ? { summary: truncate(compaction.summary, SUMMARY_CHARS) } : {}),
    lastActivityAt: ThreadMetadataModels.lastActivityTime(row),
  };
}

/**
 * Les threads entre lesquels choisir : ceux qui tournent, et ceux actifs
 * dans la fenêtre. Ceux qui partagent des nodes avec la demande d'abord.
 */
type LoadedDispatch = {
  profile: string;
  userId: Id<"users">;
  prompt: string;
  nodeIds: string[];
  forceNew: boolean;
  candidates: DispatchCandidate[];
};

export const loadCandidates = internalQuery({
  args: { dispatchId: v.id("dispatches") },
  handler: async (ctx, { dispatchId }): Promise<LoadedDispatch | null> => {
    const dispatch = await ctx.db.get("dispatches", dispatchId);
    if (!dispatch || dispatch.status !== dispatchStatuses.routing) return null;

    const now = Date.now();
    const agentName = getProfile(dispatch.profile).agentName;
    const rows = (
      await ctx.db
        .query("threadMetadata")
        .withIndex("by_userId_and_canvasId_and_agentName", (q) =>
          q
            .eq("userId", dispatch.userId)
            .eq("canvasId", dispatch.canvasId)
            .eq("agentName", agentName),
        )
        .order("desc")
        .take(THREAD_SCAN_LIMIT)
    ).filter(
      (row) =>
        row.run !== undefined ||
        now - ThreadMetadataModels.lastActivityTime(row) < CANDIDATE_WINDOW_MS,
    );

    const candidates = await Promise.all(
      rows.map((row) => describeCandidate(ctx, row)),
    );
    const mentioned = new Set(dispatch.nodeIds);
    const overlap = (candidate: DispatchCandidate) =>
      candidate.touchedNodeIds.filter((id) => mentioned.has(id)).length;
    candidates.sort(
      (a, b) => overlap(b) - overlap(a) || b.lastActivityAt - a.lastActivityAt,
    );

    return {
      profile: dispatch.profile,
      userId: dispatch.userId,
      prompt: dispatch.prompt,
      nodeIds: dispatch.nodeIds,
      forceNew: dispatch.forceNew === true,
      candidates: candidates.slice(0, MAX_CANDIDATES),
    };
  },
});

export const route = internalAction({
  args: { dispatchId: v.id("dispatches") },
  handler: async (ctx, { dispatchId }): Promise<null> => {
    const loaded: LoadedDispatch | null = await ctx.runQuery(
      internal.harness.dispatch.loadCandidates,
      { dispatchId },
    );
    if (!loaded) return null;

    const finalize = async (
      threadId: string | null,
      reason:
        | "router"
        | "no_candidates"
        | "low_confidence"
        | "router_error"
        | "forced_new",
      confidence?: number,
    ): Promise<null> => {
      await ctx.runMutation(internal.harness.dispatch.finalize, {
        dispatchId,
        threadId,
        reason,
        ...(confidence !== undefined ? { confidence } : {}),
      });
      return null;
    };

    if (loaded.forceNew) return finalize(null, "forced_new");
    const router = getProfile(loaded.profile).router;
    if (!router || loaded.candidates.length === 0) {
      return finalize(null, "no_candidates");
    }

    try {
      const decision = await router.route(
        ctx,
        {
          prompt: loaded.prompt,
          nodeIds: loaded.nodeIds,
          userId: loaded.userId,
        },
        loaded.candidates,
      );
      if (
        decision.threadId &&
        decision.confidence !== undefined &&
        decision.confidence < MIN_CONFIDENCE
      ) {
        return finalize(null, "low_confidence", decision.confidence);
      }
      return finalize(decision.threadId, "router", decision.confidence);
    } catch (error) {
      console.error("[dispatch] router failed", {
        dispatchId,
        detail: error instanceof Error ? error.message : String(error),
      });
      return finalize(null, "router_error");
    }
  },
});

/**
 * Envoie la demande au thread choisi (ou à un nouveau). Première écriture
 * gagnante : le filet planifié ne fait rien si `route` a déjà conclu.
 */
export const finalize = internalMutation({
  args: {
    dispatchId: v.id("dispatches"),
    threadId: v.union(v.string(), v.null()),
    reason: vReason,
    confidence: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<string | null> => {
    const dispatch = await ctx.db.get("dispatches", args.dispatchId);
    if (!dispatch || dispatch.status !== dispatchStatuses.routing) return null;
    const profile = getProfile(dispatch.profile);

    // Le thread choisi doit être un thread de cet utilisateur, sur ce canvas.
    let row = args.threadId
      ? await ThreadMetadataModels.findByThreadId(ctx, {
          threadId: args.threadId,
        })
      : null;
    if (
      row &&
      (row.userId !== dispatch.userId ||
        row.canvasId !== dispatch.canvasId ||
        row.agentName !== profile.agentName)
    ) {
      row = null;
    }

    let threadId = row?.threadId;
    const kind = !row
      ? ("new" as const)
      : row.run?.awaitingTaskId
        ? ("answer" as const)
        : row.run
          ? ("steer" as const)
          : ("continue" as const);
    if (!threadId) {
      threadId = await createThread(ctx, components.agent, {
        userId: dispatch.userId,
      });
      await ctx.db.insert("threadMetadata", {
        threadId,
        userId: dispatch.userId,
        canvasId: dispatch.canvasId,
        totalUsageUsd: 0,
        agentName: profile.agentName,
      });
    }

    await submitToThread(ctx, {
      threadId,
      userId: dispatch.userId,
      canvasId: dispatch.canvasId,
      profile,
      prompt: dispatch.prompt,
      content: dispatch.content,
      input: dispatch.input,
      ...(dispatch.model !== undefined ? { model: dispatch.model } : {}),
      ...(dispatch.attachments !== undefined
        ? { attachments: dispatch.attachments }
        : {}),
    });
    if (kind === "new") await profile.threadCreated?.(ctx, threadId);

    await ctx.db.patch("dispatches", dispatch._id, {
      status: dispatchStatuses.routed,
      threadId,
      decision: {
        kind,
        reason: args.reason,
        ...(args.confidence !== undefined ? { confidence: args.confidence } : {}),
      },
    });
    return threadId;
  },
});
