import { createTool } from "@convex-dev/agent";
import { z } from "zod";
import { ConvexError } from "convex/values";
import { EXPLANATION_FIELD, type ToolConfig } from "./toolHelpers";
import { toolAgentNames, type ThreadCtx } from "../agentConfig";
import { internal } from "../../_generated/api";
import {
  asSubAgentErrorData,
  subAgentToolError,
  type SubAgentErrorKind,
} from "../subAgentErrors";

// Le worker n'a pas ce tool : pas de délégation en chaîne. Le prompt du worker
// le répète, et `dispatchSubAgent` le vérifie en base — trois barrières, parce
// que la seule qui tienne vraiment est la dernière.
export const runSubAgentConfig: ToolConfig = {
  name: "run_subagent",
  authorized_agents: [toolAgentNames.nole],
};

/**
 * Turn whatever the dispatch mutation threw into a `{ kind, message }` pair.
 * Classified errors arrive as `ConvexError.data`; everything else (redacted
 * server errors, network failures) is treated as transient infrastructure.
 */
function classifySubAgentError(error: unknown): {
  kind: SubAgentErrorKind;
  message: string;
} {
  if (error instanceof ConvexError) {
    const data = asSubAgentErrorData(error.data);
    if (data) {
      return { kind: data.kind, message: data.message };
    }
    // `enforceRateLimit` lève une `ConvexError` dont `data` est une phrase.
    if (typeof error.data === "string" && error.data.length > 0) {
      return { kind: "worker_execution", message: error.data };
    }
  }
  const message = error instanceof Error ? error.message : String(error);
  return { kind: "infrastructure", message };
}

export default function runSubAgent({ threadCtx }: { threadCtx: ThreadCtx }) {
  return createTool({
    description: `Hand a self-contained task to a worker subagent. The worker has full tool access (read, write, edit, web) and runs on its own, in the background.

    THIS TOOL RETURNS IMMEDIATELY. It does not return the worker's answer — it returns a dispatch receipt. The worker's report reaches you later, as a <subagent_reports> message opening a NEW turn of this conversation. So: dispatch, then finish your turn. Tell the user what you launched and stop. Do not idle waiting for the result, do not re-dispatch the same brief, do not poll — there is nothing to poll.

    The worker starts cold. It cannot see your conversation, prior tool calls, or scratchpad. Its entire universe is the prompt you pass. Hand it every fact it needs: node ids, sources, what the user actually asked, what you've already ruled out, the shape of the answer you want back, the form of the output (node edition/creation or a result message returned to you).

    Use when: research synthesis, canvas exploration, work on another canvas of the same user, batch node work, long but trivial tasks, anything that would otherwise flood your context with intermediate output you don't need.

    canvasId: omit it to work on the current canvas. Pass one from list_user_canvases to send the worker to another canvas of the user — this is the ONLY way to touch a canvas other than the current one. It requires editor access to that canvas; you get access_denied otherwise.

    The worker cannot ask you clarifying questions and cannot spawn further workers. Independent sub-tasks should be issued as a parallel batch from your level, not as a chain. Dependent tasks must wait for the first report before the next brief is written.

    Brief format: state the goal and why it matters; cite concrete entry points (nodes, sources, URLs); say what's already known or ruled out; specify the shape and length of the answer expected; specify the output format (node or message); cap scope and depth when relevant.

    Batching: several workers dispatched in one turn report back TOGETHER, in a single message once the last one finishes. A slow worker therefore holds up its batch — keep briefs comparable in size. At most 4 workers can run at once for one conversation.

    Trust but verify: the worker's report describes what it intended to do, not necessarily what it did. If it wrote or edited nodes, read them before acting on the report.

    On failure this tool returns { success: false, errorKind, message, guidance }. errorKind tells you what happened: "invalid_arguments" (fix your input), "access_denied" (pick another canvasId or omit it), "worker_execution" (the dispatch was refused, e.g. too many workers already running — retry later), "infrastructure" (transient backend error — retry shortly).`,
    inputSchema: z.object({
      explanation: EXPLANATION_FIELD,
      instructions: z.string().describe("Instructions for the subtask to run."),
      canvasId: z.optional(
        z
          .string()
          .describe(
            "If blank, scope to the current canvas. If specified, the ID of the canvas to run the subagent on (from list_user_canvases; editor access required).",
          ),
      ),
    }),
    execute: async (ctx, { explanation, instructions, canvasId }) => {
      // Validé ici pour que le modèle lise un « corrige ton entrée » précis,
      // au lieu d'un échec générique remonté du fond du dispatch.
      const brief = instructions?.trim() ?? "";
      if (brief.length === 0) {
        console.warn("[run_subagent] rejected: empty instructions", {
          explanation,
        });
        return subAgentToolError(
          "invalid_arguments",
          "`instructions` is required and cannot be empty. Pass the full brief the worker should execute.",
        );
      }

      // Un `canvasId` blanc n'est pas une erreur : on retombe sur le canvas de
      // l'appelant plutôt que de lever.
      const targetCanvasId = canvasId?.trim() || threadCtx.canvasId;

      try {
        const { executionId, canvasId: dispatchedCanvasId } =
          await ctx.runMutation(internal.ia.subAgents.dispatchSubAgent, {
            userId: threadCtx.authUserId,
            canvasId: targetCanvasId,
            instructions: brief,
            explanation,
            // Rattache la dépense du worker à la conversation qui l'a
            // déclenché, et sert de clé au fan-in qui remettra son rapport.
            masterThreadId: ctx.threadId,
          });

        return {
          success: true,
          status: "dispatched",
          subagentId: executionId,
          canvasId: dispatchedCanvasId,
          note: "The worker is running in the background. Its report will open a new turn of this conversation. End your turn now.",
        };
      } catch (error) {
        const { kind, message } = classifySubAgentError(error);
        console.error("[run_subagent] dispatch failed", {
          explanation,
          canvasId: targetCanvasId,
          kind,
          message,
        });
        return subAgentToolError(kind, message);
      }
    },
  });
}
