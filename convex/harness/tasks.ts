import { v } from "convex/values";
import { internal } from "../_generated/api";
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
const RECOVERY_BATCH = 20;

type Task = Doc<"agentTasks">;
type ThreadRow = Doc<"threadMetadata">;
type CurrentRun = { row: ThreadRow; run: NonNullable<ThreadRow["run"]> };

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
  }
  await ThreadMetadataModels.markRunEnded(ctx, {
    threadId: current.row.threadId,
    status,
    runToken: current.run.runToken,
    errorMessage,
  });
  await ctx.db.patch("threadMetadata", current.row._id, { run: undefined });
}

/** Marque `aborted` toutes les tâches vivantes d'un run. */
async function abortRunTasks(ctx: MutationCtx, runMessageId: string) {
  const now = Date.now();
  for (const kind of [agentTaskKinds.generation, agentTaskKinds.tool]) {
    const tasks = await ctx.db
      .query("agentTasks")
      .withIndex("by_runMessageId_and_kind", (q) =>
        q.eq("runMessageId", runMessageId).eq("kind", kind),
      )
      .take(500);
    for (const task of tasks) {
      if (!liveAgentTaskStatuses.includes(task.status)) continue;
      await ctx.db.patch("agentTasks", task._id, {
        status: agentTaskStatuses.aborted,
        endedAt: now,
        leaseExpiresAt: undefined,
      });
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
      startMessageId: args.startMessageId,
      promptMessageId: args.startMessageId,
      generationTaskId,
      runToken,
      maxGenerations: args.profile.maxGenerationsPerRun,
    },
  });
  return generationTaskId;
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

    const now = Date.now();
    const attempt = task.attempt + 1;
    await ctx.db.patch("agentTasks", taskId, {
      status: agentTaskStatuses.running,
      attempt,
      startedAt: task.startedAt ?? now,
      leaseExpiresAt: now + LEASE_MS,
    });

    const prompts = await ctx.db
      .query("runPrompts")
      .withIndex("by_messageId", (q) => q.eq("messageId", task.runMessageId))
      .unique();

    return {
      taskId,
      attempt,
      profile: task.profile,
      step: task.step ?? 1,
      run: {
        threadId: task.threadId,
        userId: task.userId,
        canvasId: task.canvasId,
        runMessageId: task.runMessageId,
        ...(task.model !== undefined ? { model: task.model } : {}),
      },
      promptMessageId: task.promptMessageId ?? task.runMessageId,
      // L'entrée ne sert qu'à calculer les prompts du run, une fois.
      input: prompts ? null : (task.input ?? null),
      prompts: prompts
        ? { systemPrompt: prompts.systemPrompt, llmPrompt: prompts.llmPrompt }
        : null,
    };
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
      toolTaskIds.push(toolTaskId);
    }
    // Une seule action pour tout le round (cf. tool.runRound).
    await ctx.scheduler.runAfter(0, internal.harness.tool.runRound, {
      taskIds: toolTaskIds,
    });
  },
});

export const failGeneration = internalMutation({
  args: {
    taskId: v.id("agentTasks"),
    attempt: v.number(),
    aborted: v.boolean(),
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
    await failGenerationTask(ctx, task, {
      status: args.aborted ? agentTaskStatuses.aborted : agentTaskStatuses.failed,
      error: args.error,
    });
  },
});

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
    model: generation.model,
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
            : internal.harness.tool.run,
          { taskId: task._id },
        );
      }
    }
  },
});

async function giveUp(ctx: MutationCtx, task: Task) {
  const error = "Interrupted too many times.";
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
