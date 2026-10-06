import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { modelTools } from "./deferredTools";
import { errorText, isRetryableGenerationError } from "./errors";
import { getProfile, historyBudget } from "./profiles";
import {
  assembleRunContext,
  findCut,
  readNewestFirst,
  serializeForSummary,
  userText,
} from "./transcript";

/**
 * Compaction : la partie ancienne d'un thread, remplacée dans le contexte du
 * modèle par un résumé (cf. schemas/compactionsSchema.ts).
 *
 * Deux façons de résumer :
 * - `inCache` (fin de run) : le modèle du thread reçoit EXACTEMENT le contexte
 *   de sa dernière génération — même system prompt, mêmes tools, mêmes
 *   deltas — plus une consigne de résumé, sans droit d'appeler un tool. Le
 *   préfixe est identique : le provider le sert depuis son cache, et c'est le
 *   meilleur modèle disponible qui résume (cf. Viktor) ;
 * - `serialized` (débordement en plein run) : ce contexte ne passe plus. La
 *   partie à résumer est transcrite en texte plat, résultats de tools
 *   tronqués, et résumée à part (cf. Pi).
 *
 * Le point de coupe garde tel quel ce qui tient dans `KEEP_RECENT_TOKENS`,
 * sans jamais séparer un tool call de son résultat.
 */

const KEEP_RECENT_TOKENS = 20_000;
/** Messages de l'utilisateur repris tels quels : chacun, et au total. */
const USER_MESSAGE_CHARS = 600;
const USER_MESSAGES_TOTAL_CHARS = 6000;

const SUMMARIZER_SYSTEM =
  "You are a context summarization assistant. You read a transcript of a conversation between a user and an AI assistant working on a visual canvas, and write the summary that will replace it in the assistant's context. Never continue the conversation; only summarize it.";

function compactionRequest(instructions: string): string {
  return [
    "<compaction_request>",
    "Your context is getting long. Write a summary of this conversation so far: it will replace the older part of your context, and your most recent exchanges will stay verbatim right after it. Do not call any tool, do not answer the user — only write the summary.",
    "",
    instructions,
    "</compaction_request>",
  ].join("\n");
}

function serializedRequest(
  previousSummary: string | null,
  transcript: string,
  instructions: string,
): string {
  return [
    previousSummary
      ? `<previous_summary>\n${previousSummary}\n</previous_summary>\n`
      : "",
    `<conversation>\n${transcript}\n</conversation>`,
    "",
    "Summarize the conversation above (and the previous summary, if any) into a single summary. The most recent exchanges are kept verbatim after it.",
    "",
    instructions,
  ].join("\n");
}

/** Le plus récent d'abord dans le budget, rendu dans l'ordre. */
function keepUserMessages(messages: string[]): string[] {
  const kept: string[] = [];
  let total = 0;
  for (const message of [...messages].reverse()) {
    const text =
      message.length > USER_MESSAGE_CHARS
        ? `${message.slice(0, USER_MESSAGE_CHARS)}…`
        : message;
    if (total + text.length > USER_MESSAGES_TOTAL_CHARS) break;
    kept.unshift(text);
    total += text.length;
  }
  return kept;
}

function render(summary: string, userMessages: string[], tracked: string) {
  return [
    "<conversation_summary>",
    "The older part of this conversation was summarized to save context. The recent messages follow verbatim.",
    "",
    summary.trim(),
    userMessages.length > 0
      ? [
          "",
          "<user_messages hint=\"Everything the user wrote in the summarized part, verbatim (truncated). Their wording prevails over the summary.\">",
          ...userMessages.map((message) => `- ${message}`),
          "</user_messages>",
        ].join("\n")
      : "",
    tracked.trim() ? `\n${tracked.trim()}` : "",
    "</conversation_summary>",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

export const run = internalAction({
  args: { taskId: v.id("agentTasks") },
  handler: async (ctx, { taskId }) => {
    const claim = await ctx.runMutation(internal.harness.tasks.claimCompaction, {
      taskId,
    });
    if (!claim) return null;
    const { attempt } = claim;
    const profile = getProfile(claim.profile);
    const settings = profile.compaction;

    try {
      if (!settings || !claim.prompts) {
        await ctx.runMutation(internal.harness.tasks.completeCompaction, {
          taskId,
          attempt,
          result: null,
        });
        return null;
      }

      // Ce qui a suivi la compaction précédente : la partie à couper.
      const oldestFirst = (
        await readNewestFirst(ctx, {
          threadId: claim.run.threadId,
          upToMessageId: claim.promptMessageId,
          stopBefore: claim.compaction,
        })
      ).reverse();
      const cut = findCut(oldestFirst, KEEP_RECENT_TOKENS);
      if (!cut) {
        await ctx.runMutation(internal.harness.tasks.completeCompaction, {
          taskId,
          attempt,
          result: null,
        });
        return null;
      }
      const summarized = oldestFirst.slice(0, oldestFirst.indexOf(cut));

      const agent = profile.agent(claim.run);
      const thread = { threadId: claim.run.threadId, userId: claim.run.userId };
      const prompts = claim.prompts;
      const result =
        claim.mode === "inCache"
          ? await agent.generateText(
              ctx,
              thread,
              {
                system: prompts.systemPrompt,
                tools: modelTools(
                  profile.tools(claim.run),
                  profile.deferredTools ?? [],
                  claim.loadedTools,
                ),
                toolChoice: "none",
                prompt: compactionRequest(settings.instructions),
              },
              {
                storageOptions: { saveMessages: "none" },
                contextOptions: { recentMessages: 0 },
                contextHandler: async (handlerCtx, args) => [
                  ...(await assembleRunContext(handlerCtx, {
                    threadId: claim.run.threadId,
                    promptMessageId: claim.promptMessageId,
                    runMessageId: claim.run.runMessageId,
                    llmPrompt: prompts.llmPrompt,
                    updates: claim.updates,
                    compaction: claim.compaction,
                    maxTokens: historyBudget(profile, claim.run),
                  })),
                  ...args.inputPrompt,
                ],
              },
            )
          : await agent.generateText(
              ctx,
              thread,
              {
                system: SUMMARIZER_SYSTEM,
                prompt: serializedRequest(
                  claim.compaction?.summary ?? null,
                  serializeForSummary(summarized),
                  settings.instructions,
                ),
              },
              {
                storageOptions: { saveMessages: "none" },
                contextOptions: { recentMessages: 0 },
              },
            );
      if (!result.text.trim()) throw new Error("Empty summary.");

      const userMessages = keepUserMessages([
        ...(claim.compaction?.userMessages ?? []),
        ...summarized
          .filter((doc) => doc.message?.role === "user")
          .map(userText)
          .filter(Boolean),
      ]);
      const tracked = settings.trackedState
        ? await settings.trackedState(ctx, claim.run)
        : "";

      await ctx.runMutation(internal.harness.tasks.completeCompaction, {
        taskId,
        attempt,
        result: {
          firstKeptMessageId: cut._id,
          firstKeptOrder: cut.order,
          firstKeptStepOrder: cut.stepOrder,
          summary: render(result.text, userMessages, tracked),
          userMessages,
          tokensBefore: claim.tokensBefore,
          mode: claim.mode,
          ...(claim.run.model !== undefined ? { model: claim.run.model } : {}),
        },
      });
    } catch (error) {
      await ctx.runMutation(internal.harness.tasks.failCompaction, {
        taskId,
        attempt,
        retryable: isRetryableGenerationError(error),
        error: errorText(error),
      });
    }
    return null;
  },
});
