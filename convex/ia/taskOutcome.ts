import { v } from "convex/values";
import { internal } from "../_generated/api";
import {
  internalAction,
  internalMutation,
  internalQuery,
  type MutationCtx,
} from "../_generated/server";
import * as RunModels from "../models/runModels";
import { finalResponseText } from "../harness/runHistory";
import { aiUsageSources } from "../schemas/aiUsageSourceSchema";
import { askJev } from "./jev";

/**
 * L'issue d'une tâche (un run), pour que la carte sache quoi mettre en
 * avant (cf. runs.listPendingRuns). Presque tout se lit sans LLM :
 * nodes touchés, question en attente, échec, travail en fond. Reste une
 * question de jugement — la réponse finale compte-t-elle, ou n'est-elle qu'un
 * compte rendu de ce qui a été fait sur le canvas ? — posée à Jev en fin de
 * run.
 */

/** Ce que la carte peut montrer de la réponse sans ouvrir le chat. */
const ANSWER_TEXT_MAX = 4000;
/** Ce que Jev lit de la réponse. */
const JUDGED_TEXT_MAX = 3000;
const ANSWER_THRESHOLD = 0.5;
/** Sans juge : une réponse longue compte, même quand le canvas a bougé. */
const FALLBACK_LONG_ANSWER = 400;

const INSTRUCTIONS =
  "An assistant working on a visual canvas just finished a task (state.request) and wrote a final message (state.final_message). Does that message give the user something they need to read — an answer, findings, a recommendation, an explanation, a question back — beyond describing the changes it made on the canvas (state.nodes_changed)?";

export async function scheduleAnswerJudgment(
  ctx: MutationCtx,
  runMessageId: string,
) {
  await ctx.scheduler.runAfter(0, internal.ia.taskOutcome.judgeAnswer, {
    runMessageId,
  });
}

export const loadForJudgment = internalQuery({
  args: { runMessageId: v.string() },
  handler: async (ctx, { runMessageId }) => {
    const run = await RunModels.findByRunMessageId(ctx, runMessageId);
    if (!run) return null;
    return {
      userId: run.userId,
      request: run.request,
      nodesChanged: run.touchedNodes?.length ?? 0,
      text: await finalResponseText(ctx, runMessageId),
    };
  },
});

export const judgeAnswer = internalAction({
  args: { runMessageId: v.string() },
  handler: async (ctx, { runMessageId }) => {
    const run = await ctx.runQuery(internal.ia.taskOutcome.loadForJudgment, {
      runMessageId,
    });
    if (!run) return null;
    if (!run.text) {
      await ctx.runMutation(internal.ia.taskOutcome.saveAnswer, {
        runMessageId,
        answer: false,
      });
      return null;
    }

    let answer: boolean;
    let answerScore: number | undefined;
    try {
      const answers = await askJev(ctx, {
        userId: run.userId,
        source: aiUsageSources.taskOutcome,
        state: {
          request: run.request,
          final_message: run.text.slice(0, JUDGED_TEXT_MAX),
          nodes_changed: run.nodesChanged,
        },
        questions: {
          meaningful: {
            type: "noul",
            instructions: INSTRUCTIONS,
            criteria: {
              true: "The message carries information or a question the user needs to read.",
              false:
                "The message only reports what was done on the canvas, or is a short acknowledgement.",
            },
          },
        },
      });
      answerScore = answers.meaningful?.noul;
      if (typeof answerScore !== "number") throw new Error("No noul answer.");
      answer = answerScore >= ANSWER_THRESHOLD;
    } catch (error) {
      console.error("[taskOutcome] judge failed, falling back", {
        runMessageId,
        detail: error instanceof Error ? error.message : String(error),
      });
      answer = run.nodesChanged === 0 || run.text.length > FALLBACK_LONG_ANSWER;
    }

    await ctx.runMutation(internal.ia.taskOutcome.saveAnswer, {
      runMessageId,
      answer,
      answerText: run.text.slice(0, ANSWER_TEXT_MAX),
      ...(answerScore !== undefined ? { answerScore } : {}),
    });
    return null;
  },
});

export const saveAnswer = internalMutation({
  args: {
    runMessageId: v.string(),
    answer: v.boolean(),
    answerText: v.optional(v.string()),
    answerScore: v.optional(v.number()),
  },
  handler: async (ctx, { runMessageId, ...outcome }) => {
    const run = await RunModels.findByRunMessageId(ctx, runMessageId);
    if (!run) return;
    await ctx.db.patch("runs", run._id, outcome);
  },
});
