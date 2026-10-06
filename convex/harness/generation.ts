import { v } from "convex/values";
import { stepCountIs } from "ai";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { runModelTools } from "./kernelTools";
import {
  errorText,
  isContextOverflowError,
  isRetryableGenerationError,
} from "./errors";
import { getProfile, historyBudget } from "./profiles";
import { resolveSystemUpdate } from "./systemUpdate";
import { assembleRunContext } from "./transcript";

/**
 * Une génération : UN appel modèle, dans sa propre action.
 *
 * Le modèle reçoit les tools sans leur `execute` : le step s'arrête sur ses
 * tool calls, et c'est `tasks.completeGeneration` qui crée une tâche par appel
 * (exécutées par `harness/tool.ts`). La génération suivante sera une autre
 * action. Entre les deux, rien ne tourne.
 */

function isExpectedAbortedStreamError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("stream") &&
    message.includes("aborted") &&
    (message.includes("trying to finish") || message.includes("finish"))
  );
}

/**
 * Les compteurs d'un appel, sans `raw` (la réponse brute du fournisseur, déjà
 * exploitée par le usageHandler) ni valeur `undefined`, refusée par Convex.
 */
function plainUsage(usage: unknown): Record<string, unknown> {
  if (typeof usage !== "object" || usage === null) return {};
  const { raw: _raw, ...counters } = usage as Record<string, unknown>;
  return JSON.parse(JSON.stringify(counters)) as Record<string, unknown>;
}

export const run = internalAction({
  args: { taskId: v.id("agentTasks") },
  handler: async (ctx, { taskId }) => {
    const claim = await ctx.runMutation(internal.harness.tasks.claimGeneration, {
      taskId,
    });
    if (!claim) return null;
    const { attempt, run } = claim;
    const profile = getProfile(claim.profile);

    try {
      const prompts =
        claim.prompts ??
        (await ctx.runMutation(internal.harness.tasks.saveRunPrompts, {
          threadId: run.threadId,
          messageId: run.runMessageId,
          ...(await profile.prepareRun(ctx, run, claim.input)),
        }));

      const systemUpdate = await resolveSystemUpdate(ctx, profile, run, {
        taskId,
        attempt,
        window: claim.window,
        seenMemoryIds: claim.seenMemoryIds,
        systemUpdate: claim.systemUpdate,
      });

      const agent = profile.agent(run);

      let streamError: unknown;
      const result = await agent.streamText(
        ctx,
        { threadId: run.threadId, userId: run.userId },
        {
          promptMessageId: claim.promptMessageId,
          system: prompts.systemPrompt,
          tools: runModelTools(profile, run, claim.loadedTools),
          stopWhen: stepCountIs(1),
          // Une erreur envoyée par le provider DANS le stream ne fait rien
          // lever : sans ce relais, la génération finirait « réussie » et
          // vide, et le run se clôturerait sans un mot.
          onError: ({ error }) => {
            streamError ??= error;
          },
        },
        {
          // Le contexte est assemblé par la harness (cf. transcript.ts) : la
          // lib n'a pas à relire la fenêtre elle-même.
          contextOptions: { recentMessages: 0 },
          contextHandler: async (handlerCtx) =>
            assembleRunContext(handlerCtx, {
              threadId: run.threadId,
              promptMessageId: claim.promptMessageId,
              runMessageId: run.runMessageId,
              llmPrompt: prompts.llmPrompt,
              compaction: claim.compaction,
              maxTokens: historyBudget(profile, run),
              updates: [
                ...claim.updates,
                ...(systemUpdate
                  ? [{ beforeMessageId: null, content: systemUpdate }]
                  : []),
              ],
            }),
          saveStreamDeltas: {
            // Le découpage reste au mot : c'est lui qui donne le rendu « à la
            // machine à écrire ».
            chunking: "word",
            // Ne pas monter cette valeur : elle pilote la LATENCE D'APPARITION
            // DES TOOL CALLS. `DeltaStreamer.addParts` n'écrit que toutes les
            // `throttleMs` : un `tool-input-start` attend jusque-là avant
            // d'atteindre le client. Essayé à 400 : gain marginal, coût UX réel.
            throttleMs: 200,
          },
        },
      );
      await result.consumeStream({
        onError: (error) => {
          streamError ??= error;
        },
      });
      if (streamError) throw streamError;

      const [toolCalls, usage, finishReason] = await Promise.all([
        result.toolCalls,
        result.usage,
        result.finishReason,
      ]);

      // Appels invalides (outil inconnu, arguments hors schéma) : l'AI SDK a
      // déjà produit leur résultat d'erreur, que la lib a sauvé.
      const calls = toolCalls.filter(
        (call) => !call.invalid && !call.providerExecuted,
      );
      const invalidToolCalls = toolCalls.filter((call) => call.invalid).length;

      const assistant = [...(result.savedMessages ?? [])]
        .reverse()
        .find((message) => message.message?.role === "assistant");

      await ctx.runMutation(internal.harness.tasks.completeGeneration, {
        taskId,
        attempt,
        usage: plainUsage(usage),
        finishReason,
        response: assistant
          ? {
              messageId: assistant._id,
              order: assistant.order,
              model: assistant.model,
              provider: assistant.provider,
            }
          : undefined,
        toolCalls: calls.map((call) => ({
          toolCallId: call.toolCallId,
          toolName: call.toolName,
          input: call.input ?? {},
          replay: profile.replay(call.toolName),
        })),
        invalidToolCalls,
      });
    } catch (error) {
      // Une coupure demandée par l'utilisateur n'est pas un échec : ni rouge,
      // ni « réessayer ».
      const aborted = isExpectedAbortedStreamError(error);
      const overflow = !aborted && isContextOverflowError(error);
      const retryable =
        !aborted && !overflow && isRetryableGenerationError(error);
      await ctx.runMutation(internal.harness.tasks.failGeneration, {
        taskId,
        attempt,
        aborted,
        retryable,
        overflow,
        error: aborted ? undefined : errorText(error),
      });
      // Rejouée ou compactée : la tâche suit son cours, l'action n'a pas
      // échoué.
      if (!aborted && !retryable && !overflow) throw error;
    }
    return null;
  },
});
