import { saveMessage } from "@convex-dev/agent";
import { v } from "convex/values";
import { components, internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, type MutationCtx } from "../_generated/server";
import * as MessageMetadataModels from "../models/messageMetadataModels";
import * as ThreadMetadataModels from "../models/threadMetadataModels";
import {
  agentTaskKinds,
  agentTaskStatuses,
  isTerminalAgentTaskStatus,
  liveAgentTaskStatuses,
  vToolReplay,
  type AgentTaskStatus,
} from "../schemas/agentTasksSchema";
import {
  threadRunStatuses,
  type ThreadRunEndStatus,
} from "../schemas/threadMetadataSchema";
import {
  listQueued,
  placeSubmission,
  recordAttachments,
  withdrawQueued,
} from "./ingress";
import { LOAD_TOOLS, loadTools } from "./deferredTools";
import { ASK_USER, KERNEL_TOOL_NAMES, RUN_SUBAGENT } from "./kernelTools";
import { onSubagentRunEnded, spawnSubagent } from "./subagents";
import { getProfile } from "./profiles";
import { saveToolResult, type ToolResultOutput } from "./transcript";

/**
 * Toutes les transitions d'état de la harness. Aucune écriture dans
 * `agentTasks` ailleurs qu'ici.
 *
 * Deux gardes sur chaque écriture de fin :
 * - **fencing** : l'écriture porte l'`attempt` reçu au claim. Une exécution
 *   dont la tâche a été reprise par le cron (attempt plus récent) ne peut plus
 *   rien écrire, même si elle est encore vivante ;
 * - **run courant** : une tâche n'enchaîne que si son run est encore celui de
 *   `threadMetadata.run`. Un run abandonné (abort, nouveau message) s'arrête à
 *   sa prochaine frontière sans rien écrire de plus.
 */

/** Une action Convex meurt à 10 minutes : au-delà, la tâche est perdue. */
const LEASE_MS = 10.5 * 60 * 1000;
/** Au-delà, une tâche reprise trop souvent est abandonnée en erreur. */
const MAX_ATTEMPTS = 3;
/**
 * Attente avant de rejouer une génération sur erreur passagère : 2 s, puis
 * 8 s. Assez pour laisser passer un 429 ou un provider qui redémarre, assez
 * court pour que l'utilisateur ne croie pas le run mort.
 */
const RETRY_BASE_MS = 2000;
const RECOVERY_BATCH = 20;

type Task = Doc<"agentTasks">;
type ThreadRow = Doc<"threadMetadata">;
export type CurrentRun = {
  row: ThreadRow;
  run: NonNullable<ThreadRow["run"]>;
};

// ── Helpers ────────────────────────────────────────────────────────────────

/** Le run de la tâche, s'il est toujours le run courant de son thread. */
async function currentRun(
  ctx: MutationCtx,
  task: Pick<Task, "threadId" | "runMessageId">,
): Promise<CurrentRun | null> {
  const row = await ThreadMetadataModels.findByThreadId(ctx, {
    threadId: task.threadId,
  });
  const run = row?.run;
  if (!row || !run || run.startMessageId !== task.runMessageId) return null;
  return { row, run };
}

function readExplanation(input: unknown): string | undefined {
  if (typeof input !== "object" || input === null) return undefined;
  const { explanation } = input as { explanation?: unknown };
  if (typeof explanation !== "string") return undefined;
  return explanation.trim() || undefined;
}

/** Somme champ à champ des usages (objets imbriqués de compteurs). */
function sumUsage(
  total: Record<string, unknown>,
  usage: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...total };
  for (const [key, value] of Object.entries(usage)) {
    const current = out[key];
    if (typeof value === "number") {
      out[key] = (typeof current === "number" ? current : 0) + value;
    } else if (typeof value === "object" && value !== null) {
      out[key] = sumUsage(
        typeof current === "object" && current !== null
          ? (current as Record<string, unknown>)
          : {},
        value as Record<string, unknown>,
      );
    }
  }
  return out;
}

/**
 * Occupation de la fenêtre de contexte à la fin du run : l'usage du DERNIER
 * appel modèle, jamais la somme (cf. messageMetadataSchema `contextTokens`).
 */
function contextTokensOf(
  usage: Record<string, unknown> | undefined,
): number | undefined {
  if (!usage) return undefined;
  const { totalTokens, inputTokens, outputTokens } = usage;
  if (typeof totalTokens === "number") return totalTokens;
  if (typeof inputTokens !== "number" && typeof outputTokens !== "number") {
    return undefined;
  }
  return (
    (typeof inputTokens === "number" ? inputTokens : 0) +
    (typeof outputTokens === "number" ? outputTokens : 0)
  );
}

/** L'usage du run sur le dernier message assistant, comme le faisait streamResponse. */
async function recordRunUsage(ctx: MutationCtx, current: CurrentRun) {
  const generations = await ctx.db
    .query("agentTasks")
    .withIndex("by_runMessageId_and_kind", (q) =>
      q
        .eq("runMessageId", current.run.startMessageId)
        .eq("kind", agentTaskKinds.generation),
    )
    .take(500);

  let usage: Record<string, unknown> = {};
  let last: Task | undefined;
  for (const generation of generations) {
    if (generation.usage) usage = sumUsage(usage, generation.usage);
    if (
      generation.responseMessageId &&
      (!last || (generation.step ?? 0) > (last.step ?? 0))
    ) {
      last = generation;
    }
  }
  if (!last?.responseMessageId) return;

  await MessageMetadataModels.recordAssistantUsage(ctx, {
    userId: current.row.userId,
    agentName: last.agentName ?? current.row.agentName,
    threadId: current.row.threadId,
    messageId: last.responseMessageId,
    model: last.responseModel,
    provider: last.responseProvider ?? "openrouter",
    order: last.responseOrder,
    usage,
    contextTokens: contextTokensOf(last.usage),
  });
}

/** Clôt le run courant : usage (si réussi), statut du thread, run retiré. */
async function endRun(
  ctx: MutationCtx,
  current: CurrentRun,
  status: ThreadRunEndStatus,
  errorMessage?: string,
) {
  if (status === threadRunStatuses.idle) {
    // La comptabilité ne fait jamais échouer un run.
    try {
      await recordRunUsage(ctx, current);
    } catch (error) {
      console.error("[harness] failed to record run usage", {
        threadId: current.row.threadId,
        detail: error instanceof Error ? error.message : String(error),
      });
    }
    await maybeCompactAfterRun(ctx, current);
  }
  await ThreadMetadataModels.markRunEnded(ctx, {
    threadId: current.row.threadId,
    status,
    runToken: current.run.runToken,
    errorMessage,
  });
  await ctx.db.patch("threadMetadata", current.row._id, { run: undefined });
  // Run d'un sous-agent : son résultat revient au parent.
  if (current.run.parent) {
    await onSubagentRunEnded(ctx, current, status, errorMessage);
  }

  // Les messages arrivés trop tard pour ce run : un stop les retire, sinon le
  // premier ouvre le run suivant (les autres y seront placés en steer).
  if (status === threadRunStatuses.aborted) {
    await withdrawQueued(ctx, current.row.threadId);
  } else {
    await startNextRunFromQueue(ctx, current);
  }
}

// ── Compaction ─────────────────────────────────────────────────────────────

/** Le nombre de tokens en entrée d'un appel modèle, lu dans son usage. */
function inputTokensOf(usage: Record<string, unknown> | undefined): number {
  const value = usage?.inputTokens;
  return typeof value === "number" ? value : 0;
}

/**
 * Fin de run : si le dernier appel modèle a dépassé le seuil du profil, la
 * partie ancienne du thread est résumée en fond. Vérifié ici seulement, et
 * pas entre deux steps : compacter casse le cache, autant le faire une fois
 * le run fini (cf. Pi). Le run suivant ne l'attend pas.
 */
async function maybeCompactAfterRun(ctx: MutationCtx, current: CurrentRun) {
  const generations = await ctx.db
    .query("agentTasks")
    .withIndex("by_runMessageId_and_kind", (q) =>
      q
        .eq("runMessageId", current.run.startMessageId)
        .eq("kind", agentTaskKinds.generation),
    )
    .take(500);
  const last = generations
    .filter((generation) => generation.responseMessageId)
    .sort((a, b) => (b.step ?? 0) - (a.step ?? 0))[0];
  if (!last) return;

  const settings = getProfile(last.profile).compaction;
  if (!settings) return;
  const tokens = inputTokensOf(last.usage);
  const window = settings.contextWindow(runInfoOf(last));
  if (tokens < window * settings.thresholdRatio) return;
  if (await hasLiveCompaction(ctx, last)) return;

  await insertCompaction(ctx, last, {
    mode: "inCache",
    tokensBefore: tokens,
    promptMessageId: current.run.promptMessageId,
    loadedTools: current.run.loadedTools ?? [],
  });
}

function runInfoOf(task: Task) {
  return {
    threadId: task.threadId,
    userId: task.userId,
    canvasId: task.canvasId,
    runMessageId: task.runMessageId,
    ...(task.model !== undefined ? { model: task.model } : {}),
  };
}

async function hasLiveCompaction(ctx: MutationCtx, task: Task) {
  for (const status of [agentTaskStatuses.pending, agentTaskStatuses.running]) {
    const live = await ctx.db
      .query("agentTasks")
      .withIndex("by_canvasId_and_status", (q) =>
        q.eq("canvasId", task.canvasId).eq("status", status),
      )
      .take(100);
    if (
      live.some(
        (other) =>
          other.kind === agentTaskKinds.compaction &&
          other.threadId === task.threadId,
      )
    ) {
      return true;
    }
  }
  return false;
}

type CompactionInput = {
  mode: "inCache" | "serialized";
  tokensBefore: number;
  /** Jusqu'où lire le thread : le contexte de la génération qui a déclenché. */
  promptMessageId: string;
  loadedTools: string[];
};

async function insertCompaction(
  ctx: MutationCtx,
  from: Task,
  input: CompactionInput,
  ownerTaskId?: Id<"agentTasks">,
) {
  const taskId = await ctx.db.insert("agentTasks", {
    kind: agentTaskKinds.compaction,
    profile: from.profile,
    threadId: from.threadId,
    canvasId: from.canvasId,
    userId: from.userId,
    runMessageId: from.runMessageId,
    ...(ownerTaskId ? { ownerTaskId } : {}),
    status: agentTaskStatuses.pending,
    attempt: 0,
    leaseExpiresAt: Date.now() + LEASE_MS,
    model: from.model,
    agentName: from.agentName,
    input,
  });
  await ctx.scheduler.runAfter(0, internal.harness.compaction.run, { taskId });
  return taskId;
}

/** La dernière compaction du thread, telle que l'assemblage la lit. */
async function latestCompaction(ctx: MutationCtx, threadId: string) {
  const row = await ctx.db
    .query("compactions")
    .withIndex("by_threadId", (q) => q.eq("threadId", threadId))
    .order("desc")
    .first();
  return row
    ? {
        firstKeptMessageId: row.firstKeptMessageId,
        order: row.firstKeptOrder,
        stepOrder: row.firstKeptStepOrder,
        summary: row.summary,
        userMessages: row.userMessages,
      }
    : null;
}

async function startNextRunFromQueue(ctx: MutationCtx, previous: CurrentRun) {
  const [next] = await listQueued(ctx, previous.row.threadId);
  if (!next) return;
  const startMessageId = await placeSubmission(ctx, next, "runStart");
  await startRun(ctx, {
    threadId: next.threadId,
    userId: next.userId,
    canvasId: next.canvasId,
    startMessageId,
    profile: {
      name: previous.run.profile,
      agentName: previous.row.agentName,
      maxGenerationsPerRun: previous.run.maxGenerations,
    },
    model: next.model,
    input: next.input,
  });
}

/**
 * Place les messages en file dans le run courant, au début d'une génération :
 * après le round de tools précédent, avant l'appel modèle. Rend la nouvelle
 * position de sauvegarde du run, ou `null` s'il n'y avait rien.
 */
async function placeQueuedSteers(
  ctx: MutationCtx,
  current: CurrentRun,
): Promise<string | null> {
  let lastMessageId: string | null = null;
  let model = current.run.model;
  for (const submission of await listQueued(ctx, current.row.threadId)) {
    lastMessageId = await placeSubmission(ctx, submission, "steer");
    // Un message porte le modèle choisi au moment de l'envoi.
    if (submission.model !== undefined) model = submission.model;
  }
  if (lastMessageId) {
    current.run = { ...current.run, promptMessageId: lastMessageId, model };
    await ctx.db.patch("threadMetadata", current.row._id, { run: current.run });
  }
  return lastMessageId;
}

/** Marque `aborted` toutes les tâches vivantes d'un run. */
async function abortRunTasks(ctx: MutationCtx, runMessageId: string) {
  const now = Date.now();
  for (const kind of [
    agentTaskKinds.generation,
    agentTaskKinds.tool,
    agentTaskKinds.compaction,
  ]) {
    const tasks = await ctx.db
      .query("agentTasks")
      .withIndex("by_runMessageId_and_kind", (q) =>
        q.eq("runMessageId", runMessageId).eq("kind", kind),
      )
      .take(500);
    for (const task of tasks) {
      if (!liveAgentTaskStatuses.includes(task.status)) continue;
      // Une compaction de fin de run sert le thread, pas le run : elle vit.
      if (kind === agentTaskKinds.compaction && !task.ownerTaskId) continue;
      await ctx.db.patch("agentTasks", task._id, {
        status: agentTaskStatuses.aborted,
        endedAt: now,
        leaseExpiresAt: undefined,
      });
      // Un sous-agent de premier plan s'arrête avec son parent. Celui
      // d'arrière-plan a déjà rendu la main : son tool n'est plus vivant.
      if (task.childThreadId) await abortRun(ctx, task.childThreadId);
    }
  }
}

async function insertGeneration(
  ctx: MutationCtx,
  args: Pick<
    Task,
    | "profile"
    | "threadId"
    | "canvasId"
    | "userId"
    | "runMessageId"
    | "step"
    | "promptMessageId"
    | "model"
    | "agentName"
    | "input"
  >,
): Promise<Id<"agentTasks">> {
  const taskId = await ctx.db.insert("agentTasks", {
    ...args,
    kind: agentTaskKinds.generation,
    status: agentTaskStatuses.pending,
    attempt: 0,
    leaseExpiresAt: Date.now() + LEASE_MS,
  });
  await ctx.scheduler.runAfter(0, internal.harness.generation.run, { taskId });
  return taskId;
}

// ── Ouverture et abort d'un run (appelés par les points d'entrée) ───────────

/**
 * Ouvre un run sur un thread : statut `running`, première génération créée et
 * planifiée. Un run déjà en cours est abandonné : ses tâches s'arrêtent à leur
 * prochaine frontière.
 */
export async function startRun(
  ctx: MutationCtx,
  args: {
    threadId: string;
    userId: Id<"users">;
    canvasId: Id<"canvases">;
    startMessageId: string;
    profile: { name: string; agentName: string; maxGenerationsPerRun: number };
    model?: string;
    input: unknown;
    /** Run d'un sous-agent : le tool call qui l'a lancé. */
    parent?: NonNullable<ThreadRow["run"]>["parent"];
  },
): Promise<Id<"agentTasks">> {
  let row = await ThreadMetadataModels.findByThreadId(ctx, {
    threadId: args.threadId,
  });
  if (!row) {
    // Thread créé avant la table de metadata : la ligne est indispensable au
    // run (statut, fencing), on la crée.
    const id = await ctx.db.insert("threadMetadata", {
      threadId: args.threadId,
      userId: args.userId,
      canvasId: args.canvasId,
      totalUsageUsd: 0,
      agentName: args.profile.agentName,
    });
    row = (await ctx.db.get("threadMetadata", id))!;
  }
  if (row.run) await abortRunTasks(ctx, row.run.startMessageId);

  // Écrit ici, dans la transaction du message, pour que toutes les surfaces
  // voient le thread travailler dès l'envoi.
  const runToken = (await ThreadMetadataModels.markRunStarted(ctx, {
    threadId: args.threadId,
  }))!;

  const generationTaskId = await insertGeneration(ctx, {
    profile: args.profile.name,
    threadId: args.threadId,
    canvasId: args.canvasId,
    userId: args.userId,
    runMessageId: args.startMessageId,
    step: 1,
    promptMessageId: args.startMessageId,
    model: args.model,
    agentName: args.profile.agentName,
    input: args.input,
  });

  await ctx.db.patch("threadMetadata", row._id, {
    run: {
      profile: args.profile.name,
      startMessageId: args.startMessageId,
      promptMessageId: args.startMessageId,
      generationTaskId,
      runToken,
      maxGenerations: args.profile.maxGenerationsPerRun,
      ...(args.model !== undefined ? { model: args.model } : {}),
      ...(args.parent ? { parent: args.parent } : {}),
    },
  });
  return generationTaskId;
}

/**
 * Le point d'entrée d'un message utilisateur. Thread au repos : le message est
 * sauvé et ouvre un run. Run en cours : il part en file (steer), placé au
 * début de la prochaine génération — ou, si le run se termine avant, il
 * ouvre le suivant. La décision est prise ici, dans la transaction, et non par
 * le client, qui peut croire le thread au repos alors qu'il ne l'est plus.
 */
export async function submitToThread(
  ctx: MutationCtx,
  args: {
    threadId: string;
    userId: Id<"users">;
    canvasId: Id<"canvases">;
    profile: { name: string; agentName: string; maxGenerationsPerRun: number };
    /** Ce que l'utilisateur a tapé. */
    prompt: string;
    /** Le texte et son contexte, tel que le modèle le verra s'il est placé en steer. */
    content: string;
    /** L'entrée de la première génération, s'il ouvre un run. */
    input: unknown;
    model?: string;
    attachments?: Doc<"submissions">["attachments"];
  },
): Promise<
  | { queued: false; messageId: string }
  | { queued: true; submissionId: Id<"submissions"> }
  | { answered: true }
> {
  const row = await ThreadMetadataModels.findByThreadId(ctx, {
    threadId: args.threadId,
  });
  // Une question attend : le message y répond.
  if (
    row?.run?.awaitingTaskId &&
    (await answerPendingQuestion(ctx, args.threadId, args.prompt))
  ) {
    return { answered: true };
  }
  if (row?.run) {
    const submissionId = await ctx.db.insert("submissions", {
      threadId: args.threadId,
      userId: args.userId,
      canvasId: args.canvasId,
      status: "queued",
      prompt: args.prompt,
      content: args.content,
      input: args.input,
      model: args.model,
      attachments: args.attachments,
    });
    return { queued: true, submissionId };
  }

  const { messageId } = await saveMessage(ctx, components.agent, {
    threadId: args.threadId,
    userId: args.userId,
    prompt: args.prompt,
  });
  await recordAttachments(ctx, {
    messageId,
    threadId: args.threadId,
    userId: args.userId,
    attachments: args.attachments,
  });
  await startRun(ctx, {
    threadId: args.threadId,
    userId: args.userId,
    canvasId: args.canvasId,
    startMessageId: messageId,
    profile: args.profile,
    model: args.model,
    input: args.input,
  });
  return { queued: false, messageId };
}

/**
 * Change le modèle du run en cours : la prochaine génération le prend (celle
 * qui streame déjà finit avec l'ancien). Rend `false` s'il n'y a aucun run.
 */
export async function setRunModel(
  ctx: MutationCtx,
  threadId: string,
  model: string,
): Promise<boolean> {
  const row = await ThreadMetadataModels.findByThreadId(ctx, { threadId });
  if (!row?.run) return false;
  await ctx.db.patch("threadMetadata", row._id, {
    run: { ...row.run, model },
  });
  return true;
}

/**
 * Abandonne le run en cours d'un thread : tâches marquées `aborted`, thread
 * `aborted`. Une génération qui streame encore est coupée à part, par
 * l'abort du stream (cf. threads.abortStream). Rend `false` s'il n'y avait
 * aucun run.
 */
export async function abortRun(
  ctx: MutationCtx,
  threadId: string,
): Promise<boolean> {
  const row = await ThreadMetadataModels.findByThreadId(ctx, { threadId });
  if (!row?.run) return false;
  await abortRunTasks(ctx, row.run.startMessageId);
  await endRun(ctx, { row, run: row.run }, threadRunStatuses.aborted);
  return true;
}

// ── Génération ─────────────────────────────────────────────────────────────

export const claimGeneration = internalMutation({
  args: { taskId: v.id("agentTasks") },
  handler: async (ctx, { taskId }) => {
    const task = await ctx.db.get("agentTasks", taskId);
    if (
      !task ||
      task.kind !== agentTaskKinds.generation ||
      task.status !== agentTaskStatuses.pending
    ) {
      return null;
    }
    const current = await currentRun(ctx, task);
    if (!current || current.run.generationTaskId !== taskId) {
      await ctx.db.patch("agentTasks", taskId, {
        status: agentTaskStatuses.aborted,
        endedAt: Date.now(),
        leaseExpiresAt: undefined,
      });
      return null;
    }

    // Les messages arrivés pendant le round précédent rejoignent le run ici.
    const placed = await placeQueuedSteers(ctx, current);
    const promptMessageId =
      placed ?? task.promptMessageId ?? task.runMessageId;
    // Le modèle du run à cet instant, pas celui de la création de la tâche.
    const model = current.run.model ?? task.model;

    const now = Date.now();
    const attempt = task.attempt + 1;
    await ctx.db.patch("agentTasks", taskId, {
      status: agentTaskStatuses.running,
      attempt,
      startedAt: task.startedAt ?? now,
      leaseExpiresAt: now + LEASE_MS,
      promptMessageId,
      model,
    });

    const prompts = await ctx.db
      .query("runPrompts")
      .withIndex("by_messageId", (q) => q.eq("messageId", task.runMessageId))
      .unique();

    return {
      ...(await runContextState(ctx, task, now)),
      taskId,
      attempt,
      profile: task.profile,
      step: task.step ?? 1,
      run: {
        threadId: task.threadId,
        userId: task.userId,
        canvasId: task.canvasId,
        runMessageId: task.runMessageId,
        ...(model !== undefined ? { model } : {}),
      },
      promptMessageId,
      loadedTools: current.run.loadedTools ?? [],
      // L'entrée ne sert qu'à calculer les prompts du run, une fois.
      input: prompts ? null : (task.input ?? null),
      prompts: prompts
        ? { systemPrompt: prompts.systemPrompt, llmPrompt: prompts.llmPrompt }
        : null,
    };
  },
});

/**
 * Ce que la génération doit savoir des précédentes de son run : les deltas
 * déjà envoyés (et où les replacer), les souvenirs déjà injectés, et le début
 * de sa fenêtre — le début de la génération précédente.
 */
async function runContextState(ctx: MutationCtx, task: Task, now: number) {
  const generations = await ctx.db
    .query("agentTasks")
    .withIndex("by_runMessageId_and_kind", (q) =>
      q
        .eq("runMessageId", task.runMessageId)
        .eq("kind", agentTaskKinds.generation),
    )
    .take(500);
  const step = task.step ?? 1;
  const previous = generations.find((g) => (g.step ?? 1) === step - 1);

  const updates: { beforeMessageId: string; content: string }[] = [];
  const seenMemoryIds: string[] = [];
  for (const generation of generations) {
    // Une génération sans réponse n'a rien fait voir au modèle.
    if (generation._id === task._id || !generation.responseMessageId) continue;
    if (generation.systemUpdate) {
      updates.push({
        beforeMessageId: generation.responseMessageId,
        content: generation.systemUpdate,
      });
    }
    for (const memory of generation.memories ?? []) {
      seenMemoryIds.push(memory.id);
    }
  }
  return {
    window: { step, since: previous?.startedAt ?? null, until: now },
    updates,
    seenMemoryIds,
    compaction: await latestCompaction(ctx, task.threadId),
    // Déjà calculé par une tentative précédente : rejoué tel quel.
    systemUpdate: task.systemUpdate ?? null,
  };
}

/**
 * Le delta du step, écrit une fois : une génération rejouée relit le même, et
 * le modèle n'a jamais vu une information qui disparaît ensuite.
 */
export const saveSystemUpdate = internalMutation({
  args: {
    taskId: v.id("agentTasks"),
    attempt: v.number(),
    systemUpdate: v.string(),
    memories: v.array(
      v.object({ id: v.string(), score: v.optional(v.number()) }),
    ),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get("agentTasks", args.taskId);
    if (!task || task.attempt !== args.attempt) return null;
    if (task.systemUpdate !== undefined) return task.systemUpdate;
    await ctx.db.patch("agentTasks", args.taskId, {
      systemUpdate: args.systemUpdate,
      ...(args.memories.length > 0 ? { memories: args.memories } : {}),
    });
    return args.systemUpdate;
  },
});

/** Première écriture gagnante : une génération rejouée relit les mêmes prompts. */
export const saveRunPrompts = internalMutation({
  args: {
    threadId: v.string(),
    messageId: v.string(),
    systemPrompt: v.string(),
    llmPrompt: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("runPrompts")
      .withIndex("by_messageId", (q) => q.eq("messageId", args.messageId))
      .unique();
    if (existing) {
      return {
        systemPrompt: existing.systemPrompt,
        llmPrompt: existing.llmPrompt,
      };
    }
    await ctx.db.insert("runPrompts", args);
    return { systemPrompt: args.systemPrompt, llmPrompt: args.llmPrompt };
  },
});

export const completeGeneration = internalMutation({
  args: {
    taskId: v.id("agentTasks"),
    attempt: v.number(),
    usage: v.optional(v.record(v.string(), v.any())),
    finishReason: v.optional(v.string()),
    response: v.optional(
      v.object({
        messageId: v.string(),
        order: v.number(),
        model: v.optional(v.string()),
        provider: v.optional(v.string()),
      }),
    ),
    toolCalls: v.array(
      v.object({
        toolCallId: v.string(),
        toolName: v.string(),
        input: v.any(),
        replay: vToolReplay,
      }),
    ),
    // Appels invalides (outil inconnu, arguments hors schéma) : l'AI SDK a
    // déjà écrit leur résultat d'erreur. Le run continue pour que le modèle
    // se corrige, comme dans la boucle de la lib.
    invalidToolCalls: v.number(),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get("agentTasks", args.taskId);
    if (
      !task ||
      task.status !== agentTaskStatuses.running ||
      task.attempt !== args.attempt
    ) {
      return;
    }
    const now = Date.now();
    const recorded = {
      usage: args.usage,
      finishReason: args.finishReason,
      responseMessageId: args.response?.messageId,
      responseOrder: args.response?.order,
      responseModel: args.response?.model,
      responseProvider: args.response?.provider,
      leaseExpiresAt: undefined,
    };

    const current = await currentRun(ctx, task);
    if (!current || current.run.generationTaskId !== task._id) {
      await ctx.db.patch("agentTasks", task._id, {
        ...recorded,
        status: agentTaskStatuses.aborted,
        endedAt: now,
      });
      return;
    }

    if (args.toolCalls.length === 0) {
      await ctx.db.patch("agentTasks", task._id, {
        ...recorded,
        status: agentTaskStatuses.completed,
        endedAt: now,
      });
      if (args.invalidToolCalls > 0) {
        await advanceRun(ctx, task, current);
      } else {
        await endRun(ctx, current, threadRunStatuses.idle);
      }
      return;
    }

    // La génération possède les tools de son round et les attend : aucune
    // action ne tourne pour elle pendant ce temps.
    await ctx.db.patch("agentTasks", task._id, {
      ...recorded,
      status: agentTaskStatuses.waiting,
    });
    const toolTaskIds: Id<"agentTasks">[] = [];
    const kernelTasks: { taskId: Id<"agentTasks">; result: string }[] = [];
    for (const call of args.toolCalls) {
      const toolTaskId = await ctx.db.insert("agentTasks", {
        kind: agentTaskKinds.tool,
        profile: task.profile,
        threadId: task.threadId,
        canvasId: task.canvasId,
        userId: task.userId,
        runMessageId: task.runMessageId,
        ownerTaskId: task._id,
        status: agentTaskStatuses.pending,
        attempt: 0,
        leaseExpiresAt: now + LEASE_MS,
        toolCallId: call.toolCallId,
        toolName: call.toolName,
        input: call.input,
        explanation: readExplanation(call.input),
        replay: call.replay,
      });
      if (!KERNEL_TOOL_NAMES.includes(call.toolName)) {
        toolTaskIds.push(toolTaskId);
        continue;
      }
      // Tool du kernel : résolu ici même, ou mis en attente d'un événement.
      const outcome = await startKernelTool(ctx, {
        generation: task,
        toolTaskId,
        toolName: call.toolName,
        current,
        input: call.input,
      });
      if ("done" in outcome) {
        kernelTasks.push({ taskId: toolTaskId, result: outcome.done });
      } else {
        await ctx.db.patch("agentTasks", toolTaskId, {
          status: agentTaskStatuses.waiting,
          startedAt: now,
          leaseExpiresAt: undefined,
        });
      }
    }
    // Une seule action pour tout le round (cf. tool.runRound).
    if (toolTaskIds.length > 0) {
      await ctx.scheduler.runAfter(0, internal.harness.tool.runRound, {
        taskIds: toolTaskIds,
      });
    }
    // Les tools du kernel finissent dans la transaction ; si le round n'a
    // qu'eux, la génération suivante est créée ici même.
    for (const kernelTask of kernelTasks) {
      const toolTask = await ctx.db.get("agentTasks", kernelTask.taskId);
      if (!toolTask) continue;
      await finishTool(ctx, toolTask, {
        status: agentTaskStatuses.completed,
        output: { type: "text", value: kernelTask.result },
      });
    }
  },
});

export type KernelToolStart = {
  generation: Task;
  toolTaskId: Id<"agentTasks">;
  toolName: string;
  current: CurrentRun;
  input: unknown;
};

/** `done` : le résultat, tout de suite. `wait` : un événement le donnera. */
export type KernelToolOutcome = { done: string } | { wait: true };

async function startKernelTool(
  ctx: MutationCtx,
  start: KernelToolStart,
): Promise<KernelToolOutcome> {
  switch (start.toolName) {
    case LOAD_TOOLS:
      return {
        done: await applyLoadTools(
          ctx,
          start.generation,
          start.current,
          start.input,
        ),
      };
    case RUN_SUBAGENT:
      return spawnSubagent(ctx, start);
    case ASK_USER:
      return askUser(ctx, start);
    default:
      return { done: `Unknown tool ${start.toolName}.` };
  }
}

/**
 * `ask_user` : le run attend la réponse de l'utilisateur, sans rien
 * consommer. Le thread passe `waiting` ; un bouton de la carte ou son
 * prochain message y répond (cf. `answerPendingQuestion`).
 */
async function askUser(
  ctx: MutationCtx,
  { generation, toolTaskId, current }: KernelToolStart,
): Promise<KernelToolOutcome> {
  if (!getProfile(generation.profile).askUser) {
    return { done: "You cannot ask the user questions here." };
  }
  if (current.run.awaitingTaskId) {
    return {
      done: "Only one question at a time: this one was not asked. Wait for the answer to the first.",
    };
  }
  current.run = { ...current.run, awaitingTaskId: toolTaskId };
  await ctx.db.patch("threadMetadata", current.row._id, { run: current.run });
  await ThreadMetadataModels.markRunWaiting(ctx, {
    threadId: current.row.threadId,
    runToken: current.run.runToken,
  });
  return { wait: true };
}

/** Les options choisies, question par question (carte `ask_user`). */
export type QuestionSelection = { question: string; selected: string[] };

/**
 * Répond à la question en attente du thread, s'il y en a une : le run
 * reprend, la réponse devient le résultat d'`ask_user` — `{ answers }` pour
 * des options choisies, `{ answer }` pour un texte libre, `{ declined: true }`
 * quand `answer` est `null` (l'utilisateur refuse de répondre). Rend `false`
 * s'il n'y avait pas de question.
 */
export async function answerPendingQuestion(
  ctx: MutationCtx,
  threadId: string,
  answer: string | QuestionSelection[] | null,
): Promise<boolean> {
  const row = await ThreadMetadataModels.findByThreadId(ctx, { threadId });
  const taskId = row?.run?.awaitingTaskId;
  if (!row?.run || !taskId) return false;
  const runToken =
    (await ThreadMetadataModels.markRunResumed(ctx, {
      threadId,
      runToken: row.run.runToken,
    })) ?? row.run.runToken;
  // Avant de résoudre : la génération suivante relit le run.
  await ctx.db.patch("threadMetadata", row._id, {
    run: { ...row.run, awaitingTaskId: undefined, runToken },
  });
  return resolveWaitingTool(ctx, taskId, {
    status: "completed",
    output: {
      type: "json",
      value:
        answer === null
          ? { declined: true }
          : typeof answer === "string"
            ? { answer: answer.trim() || "(empty answer)" }
            : { answers: answer },
    },
  });
}

/**
 * Écrit le résultat d'un tool resté `waiting` (cf. kernelTools.ts) : fin d'un
 * sous-agent, réponse de l'utilisateur. Sans effet si le tool n'attend plus
 * (run abandonné entre-temps). Comme tout tool, le dernier du round enchaîne.
 */
export async function resolveWaitingTool(
  ctx: MutationCtx,
  taskId: Id<"agentTasks">,
  outcome: {
    status: "completed" | "failed";
    /** Du texte, ou une sortie de tool complète (ex. JSON). */
    output: string | ToolResultOutput;
  },
): Promise<boolean> {
  const task = await ctx.db.get("agentTasks", taskId);
  if (
    !task ||
    task.kind !== agentTaskKinds.tool ||
    task.status !== agentTaskStatuses.waiting
  ) {
    return false;
  }
  const output: ToolResultOutput =
    typeof outcome.output === "string"
      ? { type: "text", value: outcome.output }
      : outcome.output;
  await finishTool(ctx, task, {
    status: outcome.status,
    output,
    ...(outcome.status === "failed" && typeof outcome.output === "string"
      ? { error: outcome.output }
      : {}),
  });
  return true;
}

/** Ajoute au run les tools demandés ; rend ce que le modèle lira. */
async function applyLoadTools(
  ctx: MutationCtx,
  generation: Task,
  current: CurrentRun,
  input: unknown,
): Promise<string> {
  const deferred = getProfile(generation.profile).deferredTools ?? [];
  const { loaded, result } = loadTools(
    input,
    deferred,
    current.run.loadedTools ?? [],
  );
  current.run = { ...current.run, loadedTools: loaded };
  await ctx.db.patch("threadMetadata", current.row._id, { run: current.run });
  return result;
}

export const failGeneration = internalMutation({
  args: {
    taskId: v.id("agentTasks"),
    attempt: v.number(),
    aborted: v.boolean(),
    // Erreur passagère (429, 5xx, réseau, coupure du stream) : la génération
    // est rejouée tant qu'il lui reste des tentatives.
    retryable: v.optional(v.boolean()),
    // Contexte trop long pour le modèle : compacter, puis rejouer.
    overflow: v.optional(v.boolean()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get("agentTasks", args.taskId);
    if (
      !task ||
      task.status !== agentTaskStatuses.running ||
      task.attempt !== args.attempt
    ) {
      return;
    }
    if (args.overflow && !args.aborted && (await compactOnOverflow(ctx, task))) {
      return;
    }
    if (args.retryable && !args.aborted && task.attempt < MAX_ATTEMPTS) {
      const current = await currentRun(ctx, task);
      if (current && current.run.generationTaskId === task._id) {
        await retryGeneration(ctx, task, args.error);
        return;
      }
    }
    await failGenerationTask(ctx, task, {
      status: args.aborted ? agentTaskStatuses.aborted : agentTaskStatuses.failed,
      error: args.error,
    });
  },
});

/**
 * Débordement en plein run : la génération attend une compaction, qui la
 * relance. Une seule par génération — si le contexte déborde encore, c'est
 * un échec. Rend `false` quand la compaction n'est pas possible.
 */
async function compactOnOverflow(ctx: MutationCtx, task: Task) {
  const profile = getProfile(task.profile);
  if (!profile.compaction) return false;
  const current = await currentRun(ctx, task);
  if (!current || current.run.generationTaskId !== task._id) return false;
  const already = await ctx.db
    .query("agentTasks")
    .withIndex("by_ownerTaskId", (q) => q.eq("ownerTaskId", task._id))
    .first();
  if (already) return false;

  await ctx.db.patch("agentTasks", task._id, {
    status: agentTaskStatuses.waiting,
    leaseExpiresAt: undefined,
  });
  await insertCompaction(
    ctx,
    task,
    {
      mode: "serialized",
      tokensBefore: profile.compaction.contextWindow(runInfoOf(task)),
      promptMessageId: task.promptMessageId ?? task.runMessageId,
      loadedTools: current.run.loadedTools ?? [],
    },
    task._id,
  );
  return true;
}

/**
 * Rejoue la génération après un backoff. Même tâche, même position dans le
 * transcript : la lib marque `failed` les messages de la tentative ratée, que
 * le contexte ignore.
 */
async function retryGeneration(ctx: MutationCtx, task: Task, error?: string) {
  const delay = RETRY_BASE_MS * 4 ** (task.attempt - 1);
  await ctx.db.patch("agentTasks", task._id, {
    status: agentTaskStatuses.pending,
    error,
    // Le cron ne la reprend pas pendant l'attente.
    leaseExpiresAt: Date.now() + delay + LEASE_MS,
  });
  await ctx.scheduler.runAfter(delay, internal.harness.generation.run, {
    taskId: task._id,
  });
}

async function failGenerationTask(
  ctx: MutationCtx,
  task: Task,
  outcome: { status: AgentTaskStatus; error?: string },
) {
  await ctx.db.patch("agentTasks", task._id, {
    status: outcome.status,
    error: outcome.error,
    endedAt: Date.now(),
    leaseExpiresAt: undefined,
  });
  const current = await currentRun(ctx, task);
  if (!current || current.run.generationTaskId !== task._id) return;
  await endRun(
    ctx,
    current,
    outcome.status === agentTaskStatuses.aborted
      ? threadRunStatuses.aborted
      : threadRunStatuses.error,
    outcome.error,
  );
}

// ── Compaction (cf. harness/compaction.ts) ─────────────────────────────────

export const claimCompaction = internalMutation({
  args: { taskId: v.id("agentTasks") },
  handler: async (ctx, { taskId }) => {
    const task = await ctx.db.get("agentTasks", taskId);
    if (
      !task ||
      task.kind !== agentTaskKinds.compaction ||
      task.status !== agentTaskStatuses.pending
    ) {
      return null;
    }
    // Sur débordement : seulement si la génération l'attend toujours.
    if (task.ownerTaskId) {
      const owner = await ctx.db.get("agentTasks", task.ownerTaskId);
      if (!owner || owner.status !== agentTaskStatuses.waiting) {
        await ctx.db.patch("agentTasks", taskId, {
          status: agentTaskStatuses.aborted,
          endedAt: Date.now(),
          leaseExpiresAt: undefined,
        });
        return null;
      }
    }

    const now = Date.now();
    const attempt = task.attempt + 1;
    await ctx.db.patch("agentTasks", taskId, {
      status: agentTaskStatuses.running,
      attempt,
      startedAt: task.startedAt ?? now,
      leaseExpiresAt: now + LEASE_MS,
    });

    const input = task.input as CompactionInput;
    const prompts = await ctx.db
      .query("runPrompts")
      .withIndex("by_messageId", (q) => q.eq("messageId", task.runMessageId))
      .unique();
    // Les deltas du run, pour renvoyer au modèle exactement le contexte de sa
    // dernière génération (le cache sert alors le résumé).
    const generations = await ctx.db
      .query("agentTasks")
      .withIndex("by_runMessageId_and_kind", (q) =>
        q
          .eq("runMessageId", task.runMessageId)
          .eq("kind", agentTaskKinds.generation),
      )
      .take(500);
    const updates = generations.flatMap((generation) =>
      generation.systemUpdate && generation.responseMessageId
        ? [
            {
              beforeMessageId: generation.responseMessageId,
              content: generation.systemUpdate,
            },
          ]
        : [],
    );

    return {
      taskId,
      attempt,
      profile: task.profile,
      run: runInfoOf(task),
      mode: input.mode,
      tokensBefore: input.tokensBefore,
      promptMessageId: input.promptMessageId,
      loadedTools: input.loadedTools,
      updates,
      prompts: prompts
        ? { systemPrompt: prompts.systemPrompt, llmPrompt: prompts.llmPrompt }
        : null,
      compaction: await latestCompaction(ctx, task.threadId),
    };
  },
});

export const completeCompaction = internalMutation({
  args: {
    taskId: v.id("agentTasks"),
    attempt: v.number(),
    // `null` : rien d'assez ancien à résumer.
    result: v.union(
      v.null(),
      v.object({
        firstKeptMessageId: v.string(),
        firstKeptOrder: v.number(),
        firstKeptStepOrder: v.number(),
        summary: v.string(),
        userMessages: v.array(v.string()),
        tokensBefore: v.number(),
        mode: v.union(v.literal("inCache"), v.literal("serialized")),
        model: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, { taskId, attempt, result }) => {
    const task = await ctx.db.get("agentTasks", taskId);
    if (
      !task ||
      task.status !== agentTaskStatuses.running ||
      task.attempt !== attempt
    ) {
      return;
    }
    if (result) {
      await ctx.db.insert("compactions", {
        threadId: task.threadId,
        runMessageId: task.runMessageId,
        ...result,
      });
    }
    await ctx.db.patch("agentTasks", taskId, {
      status: agentTaskStatuses.completed,
      endedAt: Date.now(),
      leaseExpiresAt: undefined,
    });
    if (!task.ownerTaskId) return;

    const owner = await ctx.db.get("agentTasks", task.ownerTaskId);
    if (!owner || owner.status !== agentTaskStatuses.waiting) return;
    if (!result) {
      // Rien à résumer : la génération déborderait à nouveau.
      await failGenerationTask(ctx, owner, {
        status: agentTaskStatuses.failed,
        error: "Context too long, and nothing old enough to summarize.",
      });
      return;
    }
    await ctx.db.patch("agentTasks", owner._id, {
      status: agentTaskStatuses.pending,
      leaseExpiresAt: Date.now() + LEASE_MS,
    });
    await ctx.scheduler.runAfter(0, internal.harness.generation.run, {
      taskId: owner._id,
    });
  },
});

export const failCompaction = internalMutation({
  args: {
    taskId: v.id("agentTasks"),
    attempt: v.number(),
    retryable: v.boolean(),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get("agentTasks", args.taskId);
    if (
      !task ||
      task.status !== agentTaskStatuses.running ||
      task.attempt !== args.attempt
    ) {
      return;
    }
    if (args.retryable && task.attempt < MAX_ATTEMPTS) {
      const delay = RETRY_BASE_MS * 4 ** (task.attempt - 1);
      await ctx.db.patch("agentTasks", task._id, {
        status: agentTaskStatuses.pending,
        error: args.error,
        leaseExpiresAt: Date.now() + delay + LEASE_MS,
      });
      await ctx.scheduler.runAfter(delay, internal.harness.compaction.run, {
        taskId: task._id,
      });
      return;
    }
    await failCompactionTask(ctx, task, args.error);
  },
});

/** Une compaction ratée ne casse rien, sauf la génération qui l'attendait. */
async function failCompactionTask(ctx: MutationCtx, task: Task, error: string) {
  await ctx.db.patch("agentTasks", task._id, {
    status: agentTaskStatuses.failed,
    error,
    endedAt: Date.now(),
    leaseExpiresAt: undefined,
  });
  if (!task.ownerTaskId) return;
  const owner = await ctx.db.get("agentTasks", task.ownerTaskId);
  if (!owner || owner.status !== agentTaskStatuses.waiting) return;
  await failGenerationTask(ctx, owner, {
    status: agentTaskStatuses.failed,
    error: `Context too long; summarizing it failed: ${error}`,
  });
}

// ── Tool ───────────────────────────────────────────────────────────────────

export const claimTool = internalMutation({
  args: { taskId: v.id("agentTasks") },
  handler: async (ctx, { taskId }) => {
    const task = await ctx.db.get("agentTasks", taskId);
    if (
      !task ||
      task.kind !== agentTaskKinds.tool ||
      task.status !== agentTaskStatuses.pending ||
      !task.ownerTaskId ||
      !task.toolCallId ||
      !task.toolName
    ) {
      return null;
    }
    const owner = await ctx.db.get("agentTasks", task.ownerTaskId);
    const current = await currentRun(ctx, task);
    if (!owner || owner.status !== agentTaskStatuses.waiting || !current) {
      await ctx.db.patch("agentTasks", taskId, {
        status: agentTaskStatuses.aborted,
        endedAt: Date.now(),
        leaseExpiresAt: undefined,
      });
      return null;
    }

    // `startedAt` déjà posé = l'intention était enregistrée : l'exécution
    // précédente a peut-être produit ses effets.
    const mode = task.startedAt === undefined ? "execute" : "recover";
    const now = Date.now();
    const attempt = task.attempt + 1;
    await ctx.db.patch("agentTasks", taskId, {
      status: agentTaskStatuses.running,
      attempt,
      startedAt: task.startedAt ?? now,
      leaseExpiresAt: now + LEASE_MS,
    });
    if (mode === "execute" && task.explanation) {
      await ThreadMetadataModels.recordActivity(ctx, {
        threadId: task.threadId,
        text: task.explanation,
      });
    }

    return {
      taskId,
      attempt,
      mode,
      profile: task.profile,
      toolCallId: task.toolCallId,
      toolName: task.toolName,
      input: task.input ?? null,
      replay: task.replay ?? "unsafe",
      run: {
        threadId: task.threadId,
        userId: task.userId,
        canvasId: task.canvasId,
        runMessageId: task.runMessageId,
        ...(owner.model !== undefined ? { model: owner.model } : {}),
      },
      promptMessageId: owner.promptMessageId ?? task.runMessageId,
    };
  },
});

const vToolOutcomeStatus = v.union(
  v.literal(agentTaskStatuses.completed),
  v.literal(agentTaskStatuses.failed),
  v.literal(agentTaskStatuses.interrupted),
);

export const completeTool = internalMutation({
  args: {
    taskId: v.id("agentTasks"),
    attempt: v.number(),
    status: vToolOutcomeStatus,
    // Sortie au format du message tool-result (cf. transcript.ts).
    output: v.any(),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get("agentTasks", args.taskId);
    if (!task || task.attempt !== args.attempt || task.resultMessageId) return;
    const running = task.status === agentTaskStatuses.running;
    // Run abandonné pendant l'exécution : le résultat est quand même écrit,
    // pour que le tool call garde sa réponse dans le transcript.
    const abortedMeanwhile = task.status === agentTaskStatuses.aborted;
    if (!running && !abortedMeanwhile) return;

    await finishTool(ctx, task, {
      status: running ? args.status : agentTaskStatuses.aborted,
      output: args.output as ToolResultOutput,
      error: args.error,
    });
  },
});

/**
 * Résultat écrit dans le transcript et état terminal, dans la même
 * transaction : jamais un tool « terminé » sans résultat visible (R20). Le
 * dernier tool du round enchaîne la génération suivante.
 */
async function finishTool(
  ctx: MutationCtx,
  task: Task,
  outcome: { status: AgentTaskStatus; output: ToolResultOutput; error?: string },
) {
  const owner = task.ownerTaskId
    ? await ctx.db.get("agentTasks", task.ownerTaskId)
    : null;
  if (!owner || !task.toolCallId || !task.toolName) {
    throw new Error(`Tool task ${task._id} has no owner or call.`);
  }

  const resultMessageId = await saveToolResult(ctx, {
    threadId: task.threadId,
    userId: task.userId,
    promptMessageId: owner.promptMessageId ?? task.runMessageId,
    agentName: owner.agentName ?? "",
    toolCallId: task.toolCallId,
    toolName: task.toolName,
    output: outcome.output,
  });
  await ctx.db.patch("agentTasks", task._id, {
    status: outcome.status,
    error: outcome.error,
    resultMessageId,
    endedAt: Date.now(),
    leaseExpiresAt: undefined,
  });

  if (outcome.status !== agentTaskStatuses.aborted) {
    await continueRunIfRoundDone(ctx, owner._id);
  }
}

async function continueRunIfRoundDone(
  ctx: MutationCtx,
  generationId: Id<"agentTasks">,
) {
  const tools = await ctx.db
    .query("agentTasks")
    .withIndex("by_ownerTaskId", (q) => q.eq("ownerTaskId", generationId))
    .take(200);
  if (tools.some((tool) => !isTerminalAgentTaskStatus(tool.status))) return;

  const generation = await ctx.db.get("agentTasks", generationId);
  if (!generation || generation.status !== agentTaskStatuses.waiting) return;
  await ctx.db.patch("agentTasks", generationId, {
    status: agentTaskStatuses.completed,
    endedAt: Date.now(),
  });

  const current = await currentRun(ctx, generation);
  if (!current || current.run.generationTaskId !== generationId) return;
  await advanceRun(ctx, generation, current);
}

/**
 * Le round de `generation` est fini : génération suivante, ou fin du run si
 * le plafond du profil est atteint.
 */
async function advanceRun(
  ctx: MutationCtx,
  generation: Task,
  current: CurrentRun,
) {
  const step = generation.step ?? 1;
  if (step >= current.run.maxGenerations) {
    await endRun(ctx, current, threadRunStatuses.idle);
    return;
  }

  const nextId = await insertGeneration(ctx, {
    profile: generation.profile,
    threadId: generation.threadId,
    canvasId: generation.canvasId,
    userId: generation.userId,
    runMessageId: generation.runMessageId,
    step: step + 1,
    promptMessageId: current.run.promptMessageId,
    model: current.run.model ?? generation.model,
    agentName: generation.agentName,
    input: undefined,
  });
  await ctx.db.patch("threadMetadata", current.row._id, {
    run: { ...current.run, generationTaskId: nextId },
  });
}

// ── Reprise après crash ────────────────────────────────────────────────────

/**
 * Cron : tâches dont le lease a expiré. Une action planifiée s'exécute au plus
 * une fois et rien ne la relance si son conteneur meurt — ce cron est le seul
 * filet.
 */
export const recoverExpired = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    for (const status of [agentTaskStatuses.running, agentTaskStatuses.pending]) {
      const expired = await ctx.db
        .query("agentTasks")
        .withIndex("by_status_and_leaseExpiresAt", (q) =>
          q.eq("status", status).lt("leaseExpiresAt", now),
        )
        .take(RECOVERY_BATCH);
      for (const task of expired) {
        if (task.leaseExpiresAt === undefined) continue;
        if (task.attempt >= MAX_ATTEMPTS) {
          await giveUp(ctx, task);
          continue;
        }
        await ctx.db.patch("agentTasks", task._id, {
          status: agentTaskStatuses.pending,
          leaseExpiresAt: now + LEASE_MS,
        });
        await ctx.scheduler.runAfter(
          0,
          task.kind === agentTaskKinds.generation
            ? internal.harness.generation.run
            : task.kind === agentTaskKinds.compaction
              ? internal.harness.compaction.run
              : internal.harness.tool.run,
          { taskId: task._id },
        );
      }
    }
  },
});

async function giveUp(ctx: MutationCtx, task: Task) {
  const error = "Interrupted too many times.";
  if (task.kind === agentTaskKinds.compaction) {
    await failCompactionTask(ctx, task, error);
    return;
  }
  if (task.kind === agentTaskKinds.generation) {
    await failGenerationTask(ctx, task, {
      status: agentTaskStatuses.failed,
      error,
    });
    return;
  }
  await finishTool(ctx, task, {
    status: agentTaskStatuses.failed,
    output: {
      type: "error-text",
      value: "Tool call interrupted repeatedly; it did not complete.",
    },
    error,
  });
}
