"use node";
import {v, ConvexError} from "convex/values";
import {internalAction} from "../_generated/server";
import {baseAgent, createWorkerAgent, WORKER_MAX_STEPS} from "./agents";
import {components, internal} from "../_generated/api";
import {createThread} from "@convex-dev/agent";
import generateWorkerSystemPrompt from "./systemPrompts/workerSystemPrompt";
import {type Id} from "../_generated/dataModel";
import {
  asSubAgentErrorData,
  classifyWorkerThrow,
  subAgentConvexError,
} from "./subAgentErrors";
import {threadAgentNames} from "../schemas/threadMetadataSchema";

export const startWorkerTask = internalAction({
  args: {
    userId: v.id("users"),
    // Validated below instead of via `v.id` so a malformed id surfaces as a
    // classified `invalid_arguments` error we control, rather than an
    // ArgumentValidationError that gets redacted to "Server Error" as it
    // crosses back to the parent tool.
    canvasId: v.string(),
    instructions: v.string(),
    // Thread Nolë qui a déclenché ce worker, quand il est connu. Permet
    // d'agréger le coût d'un tour et de sa descendance via l'index
    // `by_masterThreadId`.
    masterThreadId: v.optional(v.string()),
    // Identifiant de corrélation frappé par l'appelant. Quand l'action est tuée
    // net (time limit, OOM), rien de ce qu'elle throw n'atteint le parent : ce
    // sont ses logs qui portent la cause, et cet id est ce qui permet de les
    // retrouver depuis l'erreur remontée côté tool.
    runId: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { userId, canvasId, instructions, masterThreadId, runId },
  ) => {
    // --- Phase 1: authorize the target canvas -----------------------------
    // A malformed id trips the query's `v.id` validator (→ invalid_arguments);
    // a valid-but-unauthorized id returns false (→ access_denied).
    let hasAccess: boolean;
    try {
      hasAccess = await ctx.runQuery(
        internal.wrappers.canvasWrappers.checkCanvasAccessForUser,
        {
          canvasId: canvasId as Id<"canvases">,
          userId,
        },
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.error("[startWorkerTask] invalid canvasId", {
        runId,
        canvasId,
        userId,
        detail,
      });
      throw subAgentConvexError(
        "invalid_arguments",
        `canvasId "${canvasId}" is not a valid canvas id.`,
      );
    }

    if (!hasAccess) {
      console.warn("[startWorkerTask] canvas access denied", {
        runId,
        canvasId,
        userId,
      });
      throw subAgentConvexError(
        "access_denied",
        `User does not have access to canvas "${canvasId}".`,
      );
    }

    // --- Phase 2: run the worker ------------------------------------------
    // Nothing thrown here is an argument problem the caller can fix. What it is
    // instead — step budget exhausted, provider refusal, worker crash — is
    // decided below and shipped as a classified kind, because past this
    // action's boundary the cause is no longer readable.
    // Déclaré hors du `try` : le catch en a besoin pour dire quel thread worker
    // a échoué, ce qui est le point d'entrée pour aller relire la conversation
    // du worker dans le dashboard.
    let threadId: string | undefined;
    try {
      threadId = await createThread(ctx, components.agent, {
        userId,
        title: `__WORKER__`,
      });

      // Sans cette ligne, la consommation du worker n'a aucun thread à créditer
      // et son coût disparaît du total de la conversation parente. `agentName`
      // fait partie de la clé d'index utilisée par le listing des
      // conversations d'un canvas : les threads worker n'y apparaîtront pas.
      await ctx.runMutation(internal.wrappers.threadMetadataWrappers.create, {
        threadId,
        userId,
        canvasId: canvasId as Id<"canvases">,
        agentName: threadAgentNames.worker,
        masterThreadId,
      });

      const { messageId } = await baseAgent.saveMessage(ctx, {
        threadId,
        prompt: `${instructions}`,
      });

      const workerAgent = createWorkerAgent({
        threadCtx: {
          authUserId: userId,
          canvasId: canvasId as Id<"canvases">,
        },
      });

      const workerSystemPrompt = await generateWorkerSystemPrompt({
        ctx,
        canvasId: canvasId as Id<"canvases">,
        userId,
      });

      const result = await workerAgent.generateText(
        ctx,
        {
          threadId,
          userId,
        },
        {
          prompt: instructions,
          promptMessageId: messageId,
          system: workerSystemPrompt,
        },
      );

      const text = result.text?.trim() ?? "";
      const stepsUsed = result.steps?.length ?? 0;
      const finishReason = result.finishReason;

      console.log("[startWorkerTask] worker finished", {
        runId,
        threadId,
        canvasId,
        finishReason,
        stepsUsed,
        textLength: text.length,
      });

      // Épuiser `stopWhen` n'est pas une erreur pour l'AI SDK : la boucle rend
      // la main en laissant le dernier step sur des tool calls jamais résolus.
      // C'est la seule signature d'un budget consommé, et sans ce test le
      // parent recevait `{ success: true, result: "" }` — un worker coupé en
      // plein travail, maquillé en succès.
      if (finishReason === "tool-calls") {
        throw subAgentConvexError(
          "step_limit",
          `Worker stopped on unresolved tool calls after ${stepsUsed}/${WORKER_MAX_STEPS} steps: its step budget ran out before the brief was done.`,
          text ? `Last output before the cut-off: ${text}` : undefined,
        );
      }

      if (finishReason === "length") {
        throw subAgentConvexError(
          "model_error",
          `Worker output hit the model's max token limit after ${stepsUsed} step(s) and was truncated mid-answer.`,
          text || undefined,
        );
      }

      if (finishReason === "content-filter") {
        throw subAgentConvexError(
          "model_error",
          "The provider's content filter blocked the worker's response.",
        );
      }

      // Un worker sans texte final n'a rien à rapporter, mais il a pu écrire
      // sur le canvas avant d'en arriver là : c'est un échec pour l'appelant,
      // pas un no-op.
      if (text.length === 0) {
        throw subAgentConvexError(
          "empty_result",
          `Worker ended with finishReason "${finishReason}" after ${stepsUsed} step(s) but returned no final message.`,
        );
      }

      return text;
    } catch (error) {
      // Une erreur déjà classifiée traverse intacte : c'est ce chemin que
      // prennent les quatre `subAgentConvexError` ci-dessus, qui sont levées
      // dans ce même `try`.
      if (error instanceof ConvexError && asSubAgentErrorData(error.data)) {
        throw error;
      }
      // Classifier ici, pas chez l'appelant : passé `ctx.runAction`, Convex
      // redacte toute erreur qui n'est pas une `ConvexError` en « Server
      // Error » et la cause réelle est perdue.
      const classified = classifyWorkerThrow(error);
      console.error("[startWorkerTask] worker execution failed", {
        runId,
        threadId,
        canvasId,
        userId,
        kind: classified.kind,
        detail: classified.message,
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw subAgentConvexError(
        classified.kind,
        classified.message,
        classified.details,
      );
    }
  },
});
