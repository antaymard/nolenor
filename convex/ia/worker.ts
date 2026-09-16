"use node";
import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { baseAgent, createWorkerAgent } from "./agents";
import { internal } from "../_generated/api";
import generateWorkerSystemPrompt from "./systemPrompts/workerSystemPrompt";
import { isExpectedAbortedStreamError } from "./helpers/abortedStream";
import {
  threadRunStatuses,
  type ThreadRunEndStatus,
} from "../schemas/threadMetadataSchema";
import { taskExecutionStatuses } from "../schemas/taskExecutionsSchema";

/**
 * Le run d'un sous-agent, dans SA PROPRE action.
 *
 * C'est tout l'objet de la reprise de la délégation. Avant, le tool appelait
 * `ctx.runAction` et attendait : le worker avait bien son enveloppe de dix
 * minutes, mais l'horloge du parent continuait de tourner pendant ce temps, et
 * le tour de Nolë — vingt-cinq steps, plus autant de workers que le modèle en
 * lançait — mourait avec elle. Un `finally` ne s'exécute pas quand l'action
 * meurt avec son conteneur : le thread restait `running` un quart d'heure, le
 * travail du worker était orphelin, et rien n'était réessayé.
 *
 * Ici l'action est planifiée par `subAgents.dispatchSubAgent` et ne partage
 * plus rien avec le parent. Elle rend compte par `reportSubAgentResult`, qui
 * décide de la remise.
 *
 * Elle ne vit plus non plus dans le même fichier que les mutations qui
 * l'encadrent : `"use node"` (que les tools blocknote imposent, cf.
 * `mcp/execute.ts`) interdit de mêler queries et mutations au même module.
 */
export const runWorkerTask = internalAction({
  args: {
    taskId: v.id("taskExecutions"),
    userId: v.id("users"),
    canvasId: v.id("canvases"),
    threadId: v.string(),
    instructions: v.string(),
    // Jeton du tour ouvert au dispatch. Sans lui, la fin de ce run remettrait
    // le thread au repos même si un autre l'avait relancé entre-temps.
    runToken: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (
    ctx,
    { taskId, userId, canvasId, threadId, instructions, runToken },
  ) => {
    // Décidés dans le `try`/`catch`, écrits dans le `finally` : aucun chemin de
    // sortie ne doit laisser la tâche en `running`, sans quoi elle bloquerait
    // son lot et les rapports de ses sœurs ne partiraient jamais.
    let threadEndStatus: ThreadRunEndStatus = threadRunStatuses.idle;
    let outcome: {
      status: "success" | "error";
      resultMessage?: string;
      errorMessage?: string;
    } = {
      status: taskExecutionStatuses.error,
      errorMessage: "The worker stopped before producing a report.",
    };

    try {
      await ctx.runMutation(internal.ia.subAgents.markTaskRunning, { taskId });

      const { messageId } = await baseAgent.saveMessage(ctx, {
        threadId,
        prompt: instructions,
      });

      const workerAgent = createWorkerAgent({
        threadCtx: { authUserId: userId, canvasId },
      });

      const workerSystemPrompt = await generateWorkerSystemPrompt({
        ctx,
        canvasId,
        userId,
      });

      // `streamText` et non `generateText` : la carte du dock est cliquable
      // depuis que les threads de sous-agents y figurent, et un panneau vide
      // pendant trois minutes se lirait comme une panne. Mêmes réglages que
      // `noleCompletion` — le `throttleMs` y est commenté au long.
      const result = await workerAgent.streamText(
        ctx,
        { threadId, userId },
        {
          promptMessageId: messageId,
          prompt: instructions,
          system: workerSystemPrompt,
        },
        { saveStreamDeltas: { chunking: "word", throttleMs: 200 } },
      );

      await result.consumeStream();

      const text = (await result.text)?.trim() ?? "";
      outcome = {
        status: taskExecutionStatuses.success,
        resultMessage: text || "(the worker returned no text)",
      };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);

      // Coupé par l'utilisateur (cf. `subAgents.stopSubAgentsForThread`) : la
      // tâche est déjà `stopped`, et son thread doit le rester. Sans cette
      // distinction, le `finally` réécrirait `error` par-dessus l'`aborted`
      // déjà posé — le dock afficherait en rouge une tâche que l'utilisateur
      // vient lui-même d'arrêter.
      if (isExpectedAbortedStreamError(error)) {
        threadEndStatus = threadRunStatuses.aborted;
      } else {
        threadEndStatus = threadRunStatuses.error;
        console.error("[runWorkerTask] worker execution failed", {
          taskId,
          canvasId,
          userId,
          detail,
          stack: error instanceof Error ? error.stack : undefined,
        });
      }
      outcome = { status: taskExecutionStatuses.error, errorMessage: detail };
    } finally {
      // Le compte rendu passe avant tout, y compris avant de laisser remonter
      // l'erreur d'origine : c'est lui qui débloque le lot du parent. Chaque
      // écriture est protégée pour qu'un incident de traçabilité ne masque pas
      // la panne qu'il décrit — même prudence que `noleCompletion`.
      try {
        await ctx.runMutation(
          internal.wrappers.threadMetadataWrappers.markRunEnded,
          {
            threadId,
            status: threadEndStatus,
            runToken,
            errorMessage:
              threadEndStatus === threadRunStatuses.error
                ? outcome.errorMessage
                : undefined,
          },
        );
      } catch (statusError) {
        console.error("[runWorkerTask] failed to close the worker thread", {
          taskId,
          detail:
            statusError instanceof Error
              ? statusError.message
              : String(statusError),
        });
      }

      try {
        await ctx.runMutation(internal.ia.subAgents.reportSubAgentResult, {
          taskId,
          status: outcome.status,
          resultMessage: outcome.resultMessage,
          errorMessage: outcome.errorMessage,
        });
      } catch (reportError) {
        // Le filet du cron rattrapera : la tâche reste sans `deliveredAt`, et
        // le balayage la retrouvera.
        console.error("[runWorkerTask] failed to report the result", {
          taskId,
          detail:
            reportError instanceof Error
              ? reportError.message
              : String(reportError),
        });
      }
    }

    return null;
  },
});

// `startWorkerTask` vivait ici : une action qui autorisait le canvas, créait le
// thread ET faisait tourner le worker, le tout pendant que le tool appelant
// l'attendait. Ses trois phases sont désormais séparées — l'autorisation et la
// création dans `subAgents.dispatchSubAgent` (une transaction), le run
// ci-dessus (une action à lui), la remise dans `subAgents.deliverIfReady`.
