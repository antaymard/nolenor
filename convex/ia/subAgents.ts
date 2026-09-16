import { v, ConvexError } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import { components, internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { createThread } from "@convex-dev/agent";
import { baseAgent, chatModelValues, type ChatModelValues } from "./agents";
import { getCanvasAccess, requireCanvasAccess } from "../lib/auth";
import { enforceRateLimit } from "../lib/rateLimits";
import { generateLlmId } from "../lib/llmId";
import { escapeXmlAttribute, escapeXmlText } from "../lib/xml";
import * as TaskModels from "../models/taskExecutionModels";
import * as ThreadMetadataModels from "../models/threadMetadataModels";
import * as MessageMetadataModels from "../models/messageMetadataModels";
import {
  RUN_STALE_MS,
  threadAgentNames,
  threadRunStatuses,
} from "../schemas/threadMetadataSchema";
import { taskExecutionStatuses } from "../schemas/taskExecutionsSchema";
import { subAgentConvexError } from "./subAgentErrors";

/**
 * Sous-agents vivants par conversation.
 *
 * Le rate limiter (`subAgentSpawn`) borne la dépense dans la DURÉE ; il ne dit
 * rien d'un seul tour, où le modèle est explicitement encouragé à déléguer en
 * parallèle. C'est ce plafond-ci qui borne le fan-out d'un tour — et c'était
 * l'une des raisons pour lesquelles la délégation n'avait pas tenu au premier
 * essai : un message pouvait ouvrir autant de runs que le modèle en demandait.
 *
 * Quatre, parce qu'au-delà les rapports reviennent tous ensemble (le fan-in
 * attend le lot complet) et noieraient le contexte qu'ils sont censés épargner.
 */
const MAX_CONCURRENT_SUBAGENTS = 4;

/**
 * Âge au-delà duquel une tâche encore en cours est tenue pour morte.
 *
 * Une action Convex ne peut pas dépasser dix minutes : passé onze, plus
 * personne ne conclura la tâche. La marge absorbe le délai d'ordonnancement.
 *
 * Sans ce ramassage, une seule tâche perdue bloque son lot POUR TOUJOURS :
 * `deliverIfReady` attend un état terminal qui n'arrivera jamais, et les
 * rapports de ses sœurs ne partent pas.
 */
const WORKER_STALE_MS = 11 * 60 * 1000;

// ── Dispatch ────────────────────────────────────────────────────────────────

/**
 * Ouvre une délégation, et rend la main tout de suite.
 *
 * Une MUTATION, et non une action : tout ce qui suit doit tenir ou échouer
 * ensemble. Un thread créé sans sa tâche laisserait une conversation orpheline
 * au dock ; une tâche créée sans son `runAfter` resterait `to_run` jusqu'au
 * ramassage. Dans une transaction, `scheduler.runAfter` n'est posé que si le
 * reste a commité — et il survit à un redémarrage.
 *
 * C'est aussi ce qui change tout par rapport à l'ancienne délégation : le tool
 * appelant ne fait plus qu'écrire une ligne, là où il attendait le worker
 * entier à l'intérieur de l'action de Nolë, dont l'horloge de dix minutes
 * continuait de tourner.
 */
export const dispatchSubAgent = internalMutation({
  args: {
    userId: v.id("users"),
    // `v.string()` et non `v.id` : une id malformée doit ressortir en
    // `invalid_arguments` sous notre contrôle, et non en
    // ArgumentValidationError que la traversée d'action réduit à « Server
    // Error » avant que le modèle ne la lise.
    canvasId: v.string(),
    instructions: v.string(),
    explanation: v.optional(v.string()),
    masterThreadId: v.optional(v.string()),
  },
  returns: v.object({
    taskId: v.id("taskExecutions"),
    executionId: v.string(),
    threadId: v.string(),
    canvasId: v.id("canvases"),
  }),
  handler: async (
    ctx,
    { userId, canvasId, instructions, explanation, masterThreadId },
  ) => {
    // `normalizeId` plutôt qu'un `db.get` dans un try/catch : il rend `null`
    // sur une id malformée au lieu de lever, donc le cas « le modèle a inventé
    // une id » ne passe pas par le chemin des vraies pannes.
    const targetCanvasId = ctx.db.normalizeId("canvases", canvasId);
    if (!targetCanvasId) {
      throw subAgentConvexError(
        "invalid_arguments",
        `canvasId "${canvasId}" is not a valid canvas id.`,
      );
    }

    // Garde de récursion. Le registre de tools l'assure déjà (le worker n'a pas
    // ce tool) et son prompt le répète, mais ni l'un ni l'autre n'est un
    // verrou : ceci en est un, et il coûte une lecture.
    if (masterThreadId) {
      const caller = await ThreadMetadataModels.findByThreadId(ctx, {
        threadId: masterThreadId,
      });
      if (caller?.agentName === threadAgentNames.worker) {
        throw subAgentConvexError(
          "invalid_arguments",
          "A worker cannot spawn another worker. Do the task yourself.",
        );
      }
    }

    // `editor` et share-aware, comme `ia/nole.saveMessage` sur le canvas
    // courant : le sous-agent reçoit les tools d'écriture, il doit donc passer
    // la même barre. Remplace l'ancien contrôle creator-only, qui refusait un
    // canvas partagé en editor tout en n'ayant aucune notion de viewer.
    try {
      await requireCanvasAccess(ctx, targetCanvasId, userId, "editor");
    } catch (error) {
      const detail = error instanceof ConvexError ? String(error.data) : "";
      throw subAgentConvexError(
        "access_denied",
        `No editor access to canvas "${canvasId}"${detail ? `: ${detail}` : "."}`,
      );
    }

    await enforceRateLimit(ctx, "subAgentSpawn", userId);

    if (masterThreadId) {
      const open = await TaskModels.listOpenForMaster(ctx, { masterThreadId });
      const alive = open.filter(
        (task) =>
          task.status === taskExecutionStatuses.toRun ||
          task.status === taskExecutionStatuses.running,
      );
      if (alive.length >= MAX_CONCURRENT_SUBAGENTS) {
        throw subAgentConvexError(
          "worker_execution",
          `Already ${alive.length} subagents running for this conversation (max ${MAX_CONCURRENT_SUBAGENTS}). Wait for their reports before dispatching more.`,
        );
      }
    }

    // Le titre s'affiche tel quel sur la carte du dock. `explanation` est déjà
    // un groupe nominal court dans la langue de l'utilisateur — c'est ce que
    // `EXPLANATION_FIELD` demande au modèle.
    const threadId = await createThread(ctx, components.agent, {
      userId,
      title: explanation?.trim() || "Sous-agent",
    });

    await ThreadMetadataModels.create(ctx, {
      threadId,
      userId,
      canvasId: targetCanvasId,
      agentName: threadAgentNames.worker,
      masterThreadId,
    });

    // Ici et pas au démarrage de l'action : le dock doit montrer la tâche dès
    // l'appel du tool, pas quand l'ordonnanceur veut bien la faire partir.
    const runToken = await ThreadMetadataModels.markRunStarted(ctx, {
      threadId,
    });

    const executionId = generateLlmId();
    const taskId = await TaskModels.create(ctx, {
      executionId,
      canvasId: targetCanvasId,
      explanation: explanation?.trim() || undefined,
      instructions,
      threadId,
      masterThreadId,
    });

    await ctx.scheduler.runAfter(0, internal.ia.worker.runWorkerTask, {
      taskId,
      userId,
      canvasId: targetCanvasId,
      threadId,
      instructions,
      ...(runToken !== null ? { runToken } : {}),
    });

    return { taskId, executionId, threadId, canvasId: targetCanvasId };
  },
});

/** Passe la tâche en `running`. Appelée par l'action au moment où elle démarre. */
export const markTaskRunning = internalMutation({
  args: { taskId: v.id("taskExecutions") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await TaskModels.markRunning(ctx, args);
    return null;
  },
});

/**
 * Conclut une tâche et tente la remise dans la foulée.
 *
 * Les deux dans la même mutation : le rapport devient livrable et la livraison
 * est tentée sans qu'aucun état intermédiaire ne soit observable.
 */
export const reportSubAgentResult = internalMutation({
  args: {
    taskId: v.id("taskExecutions"),
    status: v.union(
      v.literal(taskExecutionStatuses.success),
      v.literal(taskExecutionStatuses.error),
    ),
    resultMessage: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await TaskModels.markFinished(ctx, args);

    const task = await TaskModels.findById(ctx, { taskId: args.taskId });
    if (!task?.masterThreadId) return null;

    await deliver(ctx, { masterThreadId: task.masterThreadId });
    return null;
  },
});

// ── Remise au parent ────────────────────────────────────────────────────────

/**
 * Remet au thread parent les rapports de son lot, s'il est complet et si le
 * parent n'est pas déjà en train de travailler.
 *
 * Trois appelants, et c'est voulu : la fin d'un worker, la fin d'un tour de
 * Nolë (cf. le `finally` de `noleCompletion`), et le balayage du cron quand
 * l'action parente est morte avec son conteneur. Aucun des trois n'est fiable
 * seul ; ensemble ils le sont.
 *
 * L'idempotence tient à un seul détail : `markDelivered` est écrit dans la
 * MÊME transaction que le réveil. Deux appelants concurrents ne peuvent donc
 * pas réveiller deux fois — Convex rejoue le perdant de l'OCC, qui relit et ne
 * trouve plus rien à livrer.
 */
async function deliver(
  ctx: MutationCtx,
  { masterThreadId }: { masterThreadId: string },
): Promise<void> {
  const parent = await ThreadMetadataModels.findByThreadId(ctx, {
    threadId: masterThreadId,
  });
  // Conversation supprimée entre-temps : il n'y a plus personne à réveiller,
  // et les rapports n'ont plus de destinataire.
  if (!parent) return;

  // Le tour en cours livrera à sa fin (son `finally` rappelle ici). Réveiller
  // maintenant ouvrirait un second stream sur le même thread.
  //
  // Un `running` périmé fait exception : personne ne le conclura, donc
  // personne ne rappellera. Lire l'horloge est légitime dans une mutation —
  // c'est dans une query qu'elle donnerait un résultat jamais réévalué.
  if (parent.runStatus === threadRunStatuses.running) {
    const startedAt = parent.runStartedAt;
    const isStale =
      startedAt !== undefined && Date.now() - startedAt > RUN_STALE_MS;
    if (!isStale) return;
  }

  const open = await TaskModels.listOpenForMaster(ctx, { masterThreadId });
  if (open.length === 0) return;

  // Un seul réveil pour tout le lot : réveiller à chaque rapport ferait payer
  // N tours de Nolë là où un seul suffit, alors que le tool invite justement à
  // déléguer plusieurs tâches en parallèle.
  const stillWorking = open.some(
    (task) =>
      task.status === taskExecutionStatuses.toRun ||
      task.status === taskExecutionStatuses.running,
  );
  if (stillWorking) return;

  await TaskModels.markDelivered(ctx, { tasks: open });

  // Une tâche coupée par l'utilisateur est classée sans suite : elle sort du
  // lot (donc ne le bloque plus) mais ne réveille rien.
  const reports = open.filter(
    (task) => task.status !== taskExecutionStatuses.stopped,
  );
  if (reports.length === 0) return;

  // L'accès a été vérifié à l'envoi du message, il y a peut-être un quart
  // d'heure. Le tour de reprise rouvre Nolë avec TOUS ses tools d'écriture sur
  // ce canvas : le revérifier ici est le seul endroit où un partage révoqué
  // entre-temps peut encore être vu. Le lot reste marqué livré — on ne le
  // repassera pas en boucle sur un accès qui ne reviendra pas.
  const access = await getCanvasAccess(ctx, parent.canvasId, parent.userId);
  if (
    !access ||
    (access.permission !== "editor" && access.permission !== "owner")
  ) {
    console.warn("[subAgents] dropping reports: no editor access anymore", {
      masterThreadId,
      canvasId: parent.canvasId,
    });
    return;
  }

  const prompt = buildReportsPrompt(reports);
  const { messageId } = await baseAgent.saveMessage(ctx, {
    threadId: masterThreadId,
    prompt,
  });

  const runToken = await ThreadMetadataModels.markRunStarted(ctx, {
    threadId: masterThreadId,
  });

  // Sans ça le tour de reprise repartirait sur le modèle par défaut, et non
  // sur celui que l'utilisateur avait choisi pour cette conversation.
  const model = await resolveThreadModel(ctx, { threadId: masterThreadId });

  await ctx.scheduler.runAfter(0, internal.ia.noleCompletion.streamResponse, {
    authUserId: parent.userId,
    threadId: masterThreadId,
    promptMessageId: messageId,
    userPrompt: prompt,
    canvasId: parent.canvasId,
    ...(model ? { metadata: { model } } : {}),
    ...(runToken !== null ? { runToken } : {}),
  });
}

export const deliverIfReady = internalMutation({
  args: { masterThreadId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await deliver(ctx, args);
    return null;
  },
});

/**
 * Le modèle du dernier tour de la conversation, quand il fait toujours partie
 * des modèles proposés. `undefined` sinon : mieux vaut le défaut courant qu'un
 * slug retiré du catalogue, qui échouerait au premier appel.
 */
async function resolveThreadModel(
  ctx: QueryCtx,
  { threadId }: { threadId: string },
): Promise<ChatModelValues | undefined> {
  const last = await MessageMetadataModels.findLastAssistantByThreadId(ctx, {
    threadId,
  });
  const model = last?.model;
  if (!model) return undefined;
  return (chatModelValues as readonly string[]).includes(model)
    ? (model as ChatModelValues)
    : undefined;
}

/**
 * Le message que le parent recevra.
 *
 * Balisé plutôt que recollé en prose : le modèle doit voir d'un coup d'œil que
 * ceci n'est pas une demande de l'utilisateur mais le retour de ce qu'il a
 * lancé, et le front s'accroche à la même balise pour le rendre comme un
 * rapport et non comme une bulle utilisateur.
 */
function buildReportsPrompt(tasks: Doc<"taskExecutions">[]): string {
  const reports = tasks
    .map((task) => {
      const body =
        task.status === taskExecutionStatuses.success
          ? (task.resultMessage ?? "(the worker returned no text)")
          : (task.errorMessage ?? "(the worker failed without a message)");

      return [
        `  <report id="${escapeXmlAttribute(task.executionId)}"`,
        ` canvasId="${escapeXmlAttribute(task.canvasId)}"`,
        ` status="${escapeXmlAttribute(task.status)}"`,
        task.explanation
          ? ` brief="${escapeXmlAttribute(task.explanation)}"`
          : "",
        ">\n",
        escapeXmlText(body),
        "\n  </report>",
      ].join("");
    })
    .join("\n");

  return `<subagent_reports>\n${reports}\n</subagent_reports>`;
}

// ── Interruption ────────────────────────────────────────────────────────────

/**
 * Coupe les sous-agents d'une conversation que l'utilisateur vient
 * d'interrompre. L'action déjà partie n'est pas tuable ; ce qui compte est que
 * son rapport, en arrivant, ne réveille plus personne.
 */
export const stopSubAgentsForThread = internalMutation({
  args: { masterThreadId: v.string() },
  returns: v.null(),
  handler: async (ctx, { masterThreadId }) => {
    const stopped = await TaskModels.stopOpenForMaster(ctx, { masterThreadId });

    for (const task of stopped) {
      if (!task.threadId) continue;

      // Couper le flux, et pas seulement classer la tâche : le statut suffit à
      // empêcher le réveil du parent, mais le worker continuerait d'écrire sur
      // le canvas et de dépenser. `abortByOrder` fait lever son `streamText`,
      // qui sort par son `finally` — la tâche est déjà `stopped`, donc
      // `markFinished` ne la délogera pas.
      const streams = await ctx.runQuery(components.agent.streams.list, {
        threadId: task.threadId,
        statuses: ["streaming"],
      });
      for (const stream of streams) {
        await ctx.runMutation(components.agent.streams.abortByOrder, {
          threadId: task.threadId,
          order: stream.order,
          reason: "Parent conversation cancelled by user",
        });
      }

      // Leur thread resterait sinon `running` jusqu'à péremption, et le dock
      // les montrerait au travail un quart d'heure durant.
      await ThreadMetadataModels.markRunEnded(ctx, {
        threadId: task.threadId,
        status: threadRunStatuses.aborted,
      });
    }
    return null;
  },
});

// ── Rattrapage (cron) ───────────────────────────────────────────────────────

export const listStaleTaskIds = internalQuery({
  args: {},
  returns: v.array(v.id("taskExecutions")),
  handler: async (ctx) => {
    const stale = await TaskModels.listStale(ctx, {
      cutoff: Date.now() - WORKER_STALE_MS,
    });
    return stale.map((task) => task._id);
  },
});

export const listUndeliveredMasterThreadIds = internalQuery({
  args: {},
  returns: v.array(v.string()),
  handler: async (ctx) => {
    return await TaskModels.listUndeliveredMasterThreadIds(ctx);
  },
});

/**
 * Ramasse une tâche morte en vol : son action a disparu avec son conteneur,
 * donc ni son `finally` ni son rapport n'arriveront jamais.
 *
 * Une par mutation, appelée en boucle par le cron : garder chaque transaction
 * minuscule évite qu'un lot entier échoue sur une seule ligne fautive.
 */
export const reapStaleTask = internalMutation({
  args: { taskId: v.id("taskExecutions") },
  returns: v.null(),
  handler: async (ctx, { taskId }) => {
    const task = await TaskModels.findById(ctx, { taskId });
    if (!task) return null;
    if (
      task.status !== taskExecutionStatuses.running &&
      task.status !== taskExecutionStatuses.toRun
    ) {
      return null;
    }

    await TaskModels.markFinished(ctx, {
      taskId,
      status: taskExecutionStatuses.error,
      errorMessage:
        "The worker was interrupted before it could report (backend timeout).",
    });

    if (task.threadId) {
      await ThreadMetadataModels.markRunEnded(ctx, {
        threadId: task.threadId,
        status: threadRunStatuses.error,
        errorMessage: "Worker interrupted before completion.",
      });
    }

    if (task.masterThreadId) {
      await deliver(ctx, { masterThreadId: task.masterThreadId });
    }
    return null;
  },
});

/**
 * Le filet, passé toutes les cinq minutes.
 *
 * Le chemin normal est que le worker livre lui-même, ou que le tour parent le
 * fasse en sortant. Reste ce qu'aucun des deux ne couvre : une action morte
 * avec son conteneur. Personne n'appelle alors, et sans ce balayage un lot
 * resterait ouvert indéfiniment — la conversation attendrait un rapport qui ne
 * vient pas, ce qui est exactement le symptôme qui avait fait débrancher la
 * délégation.
 *
 * Une action, et non une mutation : chaque tâche ramassée et chaque remise doit
 * être sa propre transaction, pour qu'une ligne fautive n'emporte pas le reste
 * du balayage.
 *
 * Annotations de retour explicites : les appels se réfèrent à des fonctions du
 * même module, que TypeScript ne peut pas typer sans elles.
 */
export const recoverSubAgents = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx): Promise<null> => {
    const staleTaskIds: Id<"taskExecutions">[] = await ctx.runQuery(
      internal.ia.subAgents.listStaleTaskIds,
      {},
    );
    for (const taskId of staleTaskIds) {
      try {
        await ctx.runMutation(internal.ia.subAgents.reapStaleTask, { taskId });
      } catch (error) {
        console.error("[recoverSubAgents] failed to reap task", {
          taskId,
          detail: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const masterThreadIds: string[] = await ctx.runQuery(
      internal.ia.subAgents.listUndeliveredMasterThreadIds,
      {},
    );
    for (const masterThreadId of masterThreadIds) {
      try {
        await ctx.runMutation(internal.ia.subAgents.deliverIfReady, {
          masterThreadId,
        });
      } catch (error) {
        console.error("[recoverSubAgents] failed to deliver reports", {
          masterThreadId,
          detail: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return null;
  },
});

export { MAX_CONCURRENT_SUBAGENTS, WORKER_STALE_MS };
