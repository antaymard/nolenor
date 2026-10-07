import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { LOAD_TOOLS, modelTools } from "./deferredTools";
import type { Profile, RunInfo } from "./types";

/**
 * Les tools du kernel : résolus par la harness elle-même, dans la mutation
 * qui termine la génération (cf. tasks.completeGeneration), jamais par une
 * action.
 *
 * Deux façons de finir :
 * - tout de suite (`load_tools`, `run_subAgent` en arrière-plan) ;
 * - plus tard : le tool call reste `waiting`, sans lease ni action, jusqu'à
 *   ce qu'un événement venu d'ailleurs écrive son résultat
 *   (`tasks.resolveWaitingTool`) — la fin d'un sous-agent, la réponse de
 *   l'utilisateur. C'est la primitive sur laquelle se brancheront les
 *   étapes de workflow, les webhooks ou un sandbox, sans toucher au reste.
 */

export const RUN_SUBAGENT = "run_subAgent";
export const ASK_USER = "ask_user";
export const KERNEL_TOOL_NAMES = [LOAD_TOOLS, RUN_SUBAGENT, ASK_USER];

const explanation = z
  .string()
  .describe(
    "Short label shown to the user, in their language. A noun phrase under 60 characters.",
  );

const runSubagentTool = tool({
  description: `Start a worker subagent on a self-contained task, off your context window. The worker has your canvas tools (read, write, web). It runs in isolation and returns a single final message; its intermediate tool calls stay invisible to you.

The worker starts cold: it cannot see your conversation. Its whole universe is the brief you pass — give it every fact it needs: node ids, sources, what the user actually asked, what is already known or ruled out, the shape and length of the answer you want back, and whether it should edit/create nodes or just report.

Use it for research synthesis, canvas exploration, work on another canvas of the same user, batch node work, long but simple tasks — anything that would flood your context with output you don't need. Independent tasks: start several in the same step, they run in parallel. Dependent tasks: one after the other, each brief updated with the previous report.

- background: false (default) — you wait for its report, which comes back as this call's result.
- background: true — the call returns at once; the report reaches you later as a message, even after you have finished answering. Use it for long work the user doesn't need to wait for, and tell them it is running.

The worker cannot ask the user anything and cannot start workers itself. Its report says what it meant to do: check the nodes it changed before relying on it.`,
  inputSchema: z.object({
    explanation,
    instructions: z.string().describe("The full brief of the task."),
    canvasId: z
      .string()
      .optional()
      .describe(
        "Leave empty for the current canvas. Otherwise, the id of another canvas of the user to work on.",
      ),
    background: z.boolean().optional(),
  }),
});

const askUserTool = tool({
  description: `Ask the user one or more questions and wait for the answers before going on. Use it only when you cannot proceed well without their input — a real ambiguity, choices that are theirs, a confirmation before something hard to undo. Not for small talk, nor for what you can find out yourself with your tools.

Group related questions in one call (up to 4) rather than asking them one by one. For each question that is a choice, offer 2 to 6 options: a short label, and a one-line description when the trade-off is not obvious. If you recommend one, put it first and add " (Recommended)" to its label. Set multiSelect when several options can be picked together.

The result is one of:
- { answers: [{ question, selected: [labels] }] } — the options they picked;
- { answer } — their own words, typed instead of picking (it may cover several questions);
- { declined: true } — they refused to answer: do not ask again; go on with your best judgment, or stop and say what you need.`,
  inputSchema: z.object({
    explanation,
    questions: z
      .array(
        z.object({
          question: z
            .string()
            .describe("The question, in the user's language."),
          header: z
            .string()
            .optional()
            .describe("Very short tag shown above the question, e.g. 'Format'."),
          multiSelect: z
            .boolean()
            .optional()
            .describe(
              "true when the options are not mutually exclusive (e.g. which sections to include, which formats to produce): the user can pick several. Omit for a single choice.",
            ),
          options: z
            .array(
              z.object({
                label: z.string().describe("Short, 1 to 5 words."),
                description: z
                  .string()
                  .optional()
                  .describe("What this option means or implies, in one line."),
              }),
            )
            .max(6)
            .optional(),
        }),
      )
      .min(1)
      .max(4),
  }),
});

/** Les tools du kernel offerts par ce profil (hors `load_tools`). */
function kernelToolDefinitions(profile: Profile): ToolSet {
  return {
    ...(profile.subagents ? { [RUN_SUBAGENT]: runSubagentTool } : {}),
    ...(profile.askUser ? { [ASK_USER]: askUserTool } : {}),
  };
}

/**
 * Tout ce que le modèle voit d'un run : les tools du profil (différés
 * filtrés, `load_tools` compris) et ceux du kernel, sans `execute`. Le même
 * pour une génération et pour le résumé in-cache, dont le préfixe doit être
 * identique.
 */
export function runModelTools(
  profile: Profile,
  run: RunInfo,
  loadedTools: readonly string[],
): ToolSet {
  return modelTools(
    { ...profile.tools(run), ...kernelToolDefinitions(profile) },
    profile.deferredTools ?? [],
    loadedTools,
  );
}
