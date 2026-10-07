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
  query,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import { requireAuth } from "../lib/auth";
import { submissionStatuses } from "../schemas/submissionsSchema";
import * as NodeModels from "../models/nodeModels";
import * as ThreadMetadataModels from "../models/threadMetadataModels";
import { dispatchStatuses } from "../schemas/dispatchesSchema";
import { getProfile } from "./profiles";
import { submitToThread } from "./tasks";
import { userText } from "./transcript";
import { getNodeDataTitle } from "../lib/getNodeDataTitle";
import { threadRunStatuses } from "../schemas/threadMetadataSchema";
import { runToolTasks, targetNodeIds } from "./runHistory";
import type { DispatchCandidate, DispatchNode, Profile } from "./types";

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

/**
 * Fenêtre des candidats : les threads des derniers runs du canvas, ceux qui
 * tournent ou attendent, et ceux au repos actifs depuis moins de 24 h ; 8 au
 * plus. Au-delà, des threads anciens aux titres voisins brouillent le choix.
 */
const CANDIDATE_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_CANDIDATES = 8;
/** Runs récents lus pour trouver les threads actifs. */
const RUN_SCAN_LIMIT = 40;
/** Threads décrits avant le tri : la description est la partie coûteuse. */
const DESCRIBE_LIMIT = 12;
/** Tool calls du dernier run lus pour ses nodes. */
const NODE_SCAN_TOOLS = 100;
/** En dessous, le routeur hésite : nouveau thread. */
const MIN_CONFIDENCE = 0.5;
/** Le filet : au-delà, la demande part dans un nouveau thread. */
const ROUTING_DEADLINE_MS = 30_000;

const RECENT_REQUESTS = 3;
const REQUEST_CHARS = 300;
const ANSWER_CHARS = 400;
const CANDIDATE_NODES = 12;
const NODE_TITLE_CHARS = 80;
const SUMMARY_CHARS = 600;
const RECENT_DISPATCHES = 5;

const vReason = v.union(
  v.literal("router"),
  v.literal("no_candidates"),
  v.literal("low_confidence"),
  v.literal("router_error"),
  v.literal("forced_new"),
);

/**
 * Les dernières demandes de l'omnibar sur ce canvas : celles en cours
 * d'aiguillage, et où sont parties les autres. Le client décide, à l'heure du
 * rendu, combien de temps il montre un « Added to … ».
 */
export const listRecentDispatches = query({
  args: { canvasId: v.id("canvases") },
  handler: async (ctx, { canvasId }) => {
    const userId = await requireAuth(ctx);
    const rows = await ctx.db
      .query("dispatches")
      .withIndex("by_canvasId_and_userId", (q) =>
        q.eq("canvasId", canvasId).eq("userId", userId),
      )
      .order("desc")
      .take(RECENT_DISPATCHES);
    return Promise.all(
      rows.map(async (row) => {
        const thread = row.threadId
          ? await getThreadMetadata(ctx, components.agent, {
              threadId: row.threadId,
            }).catch(() => null)
          : null;
        return {
          _id: row._id,
          _creationTime: row._creationTime,
          status: row.status,
          prompt: row.prompt,
          threadId: row.threadId ?? null,
          threadTitle: thread?.title?.trim() || null,
          kind: row.decision?.kind ?? null,
          routedAt: row.routedAt ?? null,
          // Seul un steer encore en file se défait sans perte.
          canRedirect:
            row.decision?.kind === "steer" &&
            row.submissionId !== undefined &&
            !row.redirected,
          redirected: row.redirected === true,
        };
      }),
    );
  },
});

/**
 * « Start a new task instead » : la demande, partie en steer dans un thread
 * qui travaille, est retirée de sa file et renvoyée en nouvelle tâche. Rien
 * à défaire tant qu'elle n'a pas été placée.
 */
export async function redispatchAsNew(
  ctx: MutationCtx,
  dispatchId: Id<"dispatches">,
  userId: Id<"users">,
): Promise<boolean> {
  const dispatch = await ctx.db.get("dispatches", dispatchId);
  if (
    !dispatch ||
    dispatch.userId !== userId ||
    dispatch.redirected ||
    !dispatch.submissionId
  ) {
    return false;
  }
  const submission = await ctx.db.get("submissions", dispatch.submissionId);
  if (!submission || submission.status !== submissionStatuses.queued) {
    return false;
  }
  await ctx.db.patch("submissions", submission._id, {
    status: submissionStatuses.withdrawn,
  });
  await ctx.db.patch("dispatches", dispatch._id, { redirected: true });
  await dispatchRequest(ctx, {
    canvasId: dispatch.canvasId,
    userId: dispatch.userId,
    profile: { name: dispatch.profile },
    prompt: dispatch.prompt,
    content: dispatch.content,
    input: dispatch.input,
    ...(dispatch.model !== undefined ? { model: dispatch.model } : {}),
    ...(dispatch.attachments !== undefined
      ? { attachments: dispatch.attachments }
      : {}),
    nodeIds: dispatch.nodeIds,
    forceNew: true,
  });
  return true;
}

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
    ...(args.attachments !== undefined
      ? { attachments: args.attachments }
      : {}),
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

/**
 * Les derniers messages du thread, hors tools : les demandes récentes de
 * l'utilisateur et la dernière réponse du thread.
 */
async function recentExchange(ctx: QueryCtx, threadId: string) {
  const page: { page: MessageDoc[] } = await ctx.runQuery(
    components.agent.messages.listMessagesByThreadId,
    {
      threadId,
      order: "desc",
      excludeToolMessages: true,
      paginationOpts: { cursor: null, numItems: 12 },
    },
  );
  const requests = page.page
    .filter((doc) => doc.message?.role === "user")
    .map(userText)
    // Les rapports de sous-agents ne sont pas des demandes de l'utilisateur.
    .filter((text) => text && !text.startsWith("<subagent_result"))
    .slice(0, RECENT_REQUESTS)
    .map((text) => truncate(text, REQUEST_CHARS));
  const answer = page.page.find(
    (doc) => doc.message?.role === "assistant" && doc.text?.trim(),
  )?.text;
  return {
    requests,
    ...(answer ? { lastAnswer: truncate(answer.trim(), ANSWER_CHARS) } : {}),
  };
}

/** Un node du canvas par son id, s'il y est encore. */
async function describeNode(
  ctx: QueryCtx,
  canvasId: Id<"canvases">,
  node: Doc<"nodes"> | null,
): Promise<DispatchNode | null> {
  if (!node || node.canvasId !== canvasId || node.status === "trashed") {
    return null;
  }
  const data = await ctx.db.get(
    "nodeDatas",
    node.nodeDataId as Id<"nodeDatas">,
  );
  return {
    id: node.id,
    type: node.type,
    title: truncate(
      data ? getNodeDataTitle(data) : node.type,
      NODE_TITLE_CHARS,
    ),
  };
}

async function describeNodeIds(
  ctx: QueryCtx,
  canvasId: Id<"canvases">,
  nodeIds: string[],
): Promise<DispatchNode[]> {
  const nodes: DispatchNode[] = [];
  for (const nodeId of nodeIds.slice(0, CANDIDATE_NODES)) {
    const node = await describeNode(
      ctx,
      canvasId,
      await NodeModels.getNodeByLlmId(ctx, { nodeId }),
    );
    if (node) nodes.push(node);
  }
  return nodes;
}

/**
 * Les nodes sur lesquels le thread a travaillé : ceux qu'il a écrits (sur
 * toute sa durée), puis ceux que son dernier run a lus — le lien qu'on lui a
 * demandé d'analyser, par exemple.
 */
async function candidateNodes(
  ctx: QueryCtx,
  row: Doc<"threadMetadata">,
  lastRunMessageId: string | undefined,
): Promise<DispatchCandidate["nodes"]> {
  const nodes: DispatchCandidate["nodes"] = [];
  const seen = new Set<string>();
  const add = (node: DispatchNode | null, access: "wrote" | "read") => {
    if (!node || seen.has(node.id) || nodes.length >= CANDIDATE_NODES) return;
    seen.add(node.id);
    nodes.push({ ...node, access });
  };

  const touches = [...(row.touchedNodes ?? [])].sort((a, b) => b.at - a.at);
  for (const touch of touches) {
    if (nodes.length >= CANDIDATE_NODES) break;
    if (touch.kind === "deleted") continue;
    add(
      await describeNode(
        ctx,
        row.canvasId,
        await NodeModels.getNodeByNodeDataId(ctx, {
          nodeDataId: touch.nodeDataId,
        }),
      ),
      "wrote",
    );
  }

  if (lastRunMessageId) {
    const tools = await runToolTasks(ctx, lastRunMessageId, NODE_SCAN_TOOLS);
    for (const tool of tools) {
      if (nodes.length >= CANDIDATE_NODES) break;
      if (tool.status !== "completed") continue;
      for (const nodeId of targetNodeIds(tool.input)) {
        if (seen.has(nodeId)) continue;
        add(
          await describeNode(
            ctx,
            row.canvasId,
            await NodeModels.getNodeByLlmId(ctx, { nodeId }),
          ),
          tool.replay === "safe" ? "read" : "wrote",
        );
      }
    }
  }
  return nodes;
}

function runOutcome(
  run: Doc<"runs">,
): NonNullable<DispatchCandidate["lastRun"]>["outcome"] {
  switch (run.status) {
    case threadRunStatuses.running:
      return "running";
    case threadRunStatuses.waiting:
      return "waiting";
    case threadRunStatuses.error:
      return "failed";
    case threadRunStatuses.aborted:
      return "stopped";
    default:
      return (run.touchedNodes?.length ?? 0) > 0 ? "edited_canvas" : "answered";
  }
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
  lastRun: Doc<"runs">,
): Promise<DispatchCandidate> {
  const thread = await getThreadMetadata(ctx, components.agent, {
    threadId: row.threadId,
  }).catch(() => null);
  const compaction = await ctx.db
    .query("compactions")
    .withIndex("by_threadId", (q) => q.eq("threadId", row.threadId))
    .order("desc")
    .first();
  const question = row.run?.awaitingTaskId
    ? await pendingQuestion(ctx, row.run.awaitingTaskId)
    : undefined;
  const exchange = await recentExchange(ctx, row.threadId);

  return {
    threadId: row.threadId,
    title: thread?.title?.trim() || null,
    status: row.run ? (row.run.awaitingTaskId ? "waiting" : "running") : "idle",
    ...(question ? { pendingQuestion: question } : {}),
    recentRequests: exchange.requests,
    ...(exchange.lastAnswer ? { lastAnswer: exchange.lastAnswer } : {}),
    lastRun: {
      startedAt: lastRun.startedAt,
      ...(lastRun.endedAt !== undefined ? { endedAt: lastRun.endedAt } : {}),
      outcome: runOutcome(lastRun),
    },
    nodes: await candidateNodes(ctx, row, lastRun.runMessageId),
    ...(compaction
      ? { summary: truncate(compaction.summary, SUMMARY_CHARS) }
      : {}),
    lastActivityAt: ThreadMetadataModels.lastActivityTime(row),
  };
}

/**
 * Les threads entre lesquels choisir : ceux des derniers runs du canvas qui
 * tournent, ou ont été actifs dans la fenêtre. Ceux qui partagent des nodes
 * avec la demande d'abord.
 */
type LoadedDispatch = {
  profile: string;
  userId: Id<"users">;
  prompt: string;
  nodes: DispatchNode[];
  forceNew: boolean;
  candidates: DispatchCandidate[];
};

export const loadCandidates = internalQuery({
  args: { dispatchId: v.id("dispatches") },
  handler: async (ctx, { dispatchId }): Promise<LoadedDispatch | null> => {
    const dispatch = await ctx.db.get("dispatches", dispatchId);
    if (!dispatch || dispatch.status !== dispatchStatuses.routing) return null;

    // Les threads dans l'ordre de leur dernier run : l'ordre d'activité, que
    // `threadMetadata` (indexé par date de création) ne donne pas.
    const agentName = getProfile(dispatch.profile).agentName;
    const recentRuns = await ctx.db
      .query("runs")
      .withIndex("by_canvasId_and_userId_and_agentName", (q) =>
        q
          .eq("canvasId", dispatch.canvasId)
          .eq("userId", dispatch.userId)
          .eq("agentName", agentName),
      )
      .order("desc")
      .take(RUN_SCAN_LIMIT);
    const lastRunByThread = new Map<string, Doc<"runs">>();
    for (const run of recentRuns) {
      if (!lastRunByThread.has(run.threadId)) {
        lastRunByThread.set(run.threadId, run);
      }
    }

    const now = Date.now();
    const admitted: { row: Doc<"threadMetadata">; lastRun: Doc<"runs"> }[] = [];
    for (const [threadId, lastRun] of lastRunByThread) {
      if (admitted.length >= DESCRIBE_LIMIT) break;
      const row = await ThreadMetadataModels.findByThreadId(ctx, { threadId });
      if (
        row &&
        (row.run !== undefined ||
          now - ThreadMetadataModels.lastActivityTime(row) < CANDIDATE_WINDOW_MS)
      ) {
        admitted.push({ row, lastRun });
      }
    }

    const candidates = await Promise.all(
      admitted.map(({ row, lastRun }) => describeCandidate(ctx, row, lastRun)),
    );
    const mentioned = new Set(dispatch.nodeIds);
    const overlap = (candidate: DispatchCandidate) =>
      candidate.nodes.filter((node) => mentioned.has(node.id)).length;
    candidates.sort(
      (a, b) => overlap(b) - overlap(a) || b.lastActivityAt - a.lastActivityAt,
    );

    return {
      profile: dispatch.profile,
      userId: dispatch.userId,
      prompt: dispatch.prompt,
      nodes: await describeNodeIds(ctx, dispatch.canvasId, dispatch.nodeIds),
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
          nodes: loaded.nodes,
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

    const submitted = await submitToThread(ctx, {
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
      routedAt: Date.now(),
      ...("submissionId" in submitted
        ? { submissionId: submitted.submissionId }
        : {}),
      threadId,
      decision: {
        kind,
        reason: args.reason,
        ...(args.confidence !== undefined
          ? { confidence: args.confidence }
          : {}),
      },
    });
    return threadId;
  },
});
