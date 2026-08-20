import { createTool } from "@convex-dev/agent";
import { z } from "zod";
import { ConvexError } from "convex/values";
import { EXPLANATION_FIELD, type ToolConfig } from "./toolHelpers";
import { toolAgentNames, type ThreadCtx } from "../agentConfig";
import { internal } from "../../_generated/api";
import { type Id } from "../../_generated/dataModel";
import {
  asSubAgentErrorData,
  classifyWorkerThrow,
  subAgentToolError,
  type SubAgentErrorKind,
} from "../subAgentErrors";

// Worker cannot run subtasks itself.
export const runSubAgentConfig: ToolConfig = {
  name: "run_subAgent",
  authorized_agents: [
    toolAgentNames.nole,
    toolAgentNames.clone,
    toolAgentNames.supervisor,
  ],
};

/**
 * Convex kills an action at 10 minutes. A `ctx.runAction` that fails after
 * running that long was killed by the limit, not by anything the worker could
 * catch — its own `catch` never ran, so nothing structured comes back.
 *
 * The attribution threshold sits below the real limit: the worker also spends
 * time before and after its own try block, and we would rather call a 9-minute
 * death a timeout than leave it in the unknown bucket.
 */
const ACTION_TIME_LIMIT_MS = 10 * 60 * 1000;
const TIMEOUT_ATTRIBUTION_MS = 9 * 60 * 1000;

/**
 * Turn whatever the worker action threw into a classified failure.
 *
 * The worker classifies its own failures (cf. ia/worker.ts) and ships the
 * result in `ConvexError.data`, which survives the action boundary. Anything
 * arriving unstructured means the worker never got to speak: Convex redacts
 * non-`ConvexError` failures to "Server Error" as they cross, so the elapsed
 * time and the correlation id are the only witnesses left.
 */
function classifySubAgentError(
  error: unknown,
  { runId, elapsedMs }: { runId: string; elapsedMs: number },
): {
  kind: SubAgentErrorKind;
  message: string;
  details?: string;
} {
  if (error instanceof ConvexError) {
    const data = asSubAgentErrorData(error.data);
    if (data) {
      return { kind: data.kind, message: data.message, details: data.details };
    }
    // A ConvexError that crossed intact but carries no kind: the worker's own
    // logic failed and said why. Its message survived redaction, so reporting
    // "died without a cause" below would be a lie.
    if (typeof error.data === "string" && error.data.length > 0) {
      return { kind: "worker_execution", message: error.data };
    }
  }

  const elapsed = `${Math.round(elapsedMs / 1000)}s`;
  const raw = classifyWorkerThrow(error);

  // A run that died on the clock is a timeout whatever the redacted message
  // says — the duration is harder evidence than the string.
  if (elapsedMs >= TIMEOUT_ATTRIBUTION_MS) {
    return {
      kind: "worker_timeout",
      message: `Worker was killed after ${elapsed}, at Convex's ${ACTION_TIME_LIMIT_MS / 60000}-minute action execution limit, with the task unfinished.`,
      details: `Convex log correlation id: ${runId}`,
    };
  }

  // The classifier positively recognised something (a provider error, an AI SDK
  // error): that beats the unknown bucket.
  if (raw.kind !== "worker_execution") {
    return raw;
  }

  return {
    kind: "infrastructure",
    message: `Worker died after ${elapsed} without reporting a cause: ${raw.message}`,
    details: `Convex redacts non-ConvexError failures across the action boundary. Search the deployment logs for runId "${runId}" on ia/worker:startWorkerTask to see the real failure.`,
  };
}

export default function runSubAgent({ threadCtx }: { threadCtx: ThreadCtx }) {
  return createTool({
    description: `Spawn a worker subagent to handle a self-contained task off your context window. The worker has full tool access (read, write, edit, web). It runs in isolation, executes the brief, and returns a single final message — every intermediate tool call is invisible to you.

    The worker starts cold. It cannot see your conversation, prior tool calls, or scratchpad. Its entire universe is the prompt you pass. Hand it every fact it needs: node ids, sources, what the user actually asked, what you've already ruled out, the shape of the answer you want back, the form of the output (node edition/creation or simple result message given back to you).

    Use when: research synthesis, canvas or codebase exploration, exploration or actions on other canvases than the current one (but belong to the same user), batch canvas/nodes work, long but trivial tasks, anything that would otherwise flood your context with intermediate output you don't need.

    The worker cannot ask you clarifying questions and cannot spawn further workers. Multiple independent sub-tasks should be issued as a parallel batch from your level, not as a chain.

    Brief format: state the goal and why it matters; cite concrete entry points (nodes, symbols, URLs); say what's already known or ruled out; specify the shape and length of the answer expected; specify the output format (node or message); cap scope and depth when relevant.

    Trust but verify: the worker's final message describes what it intended to do, not necessarily what it did. If it wrote or edited files, check the diff before acting on the report.

    Feel free to call this tool multiple times in parallel with different briefs, when the tasks are independent and can be done in any order. For dependent tasks, break them down and call sequentially with updated briefs based on the previous worker's report.

    On failure this tool returns { success: false, errorKind, message, guidance }, plus details when there is evidence worth reading. Read errorKind before deciding what to do: "invalid_arguments" (fix your input), "access_denied" (pick another canvasId or omit it), "step_limit" (it ran out of steps mid-task — PART of the work may already be applied, inspect the canvas, then re-brief on the remainder only), "empty_result" (it finished without an answer — check whether it changed anything before retrying), "model_error" (the provider refused or truncated the generation — shorten the brief and retry once), "worker_execution" (the worker ran but failed — retryable), "worker_timeout" (killed at the execution time limit with work half-applied — split the task, do NOT replay the same brief), "infrastructure" (transient backend error — retry shortly).`,
    inputSchema: z.object({
      explanation: EXPLANATION_FIELD,
      instructions: z.string().describe("Instructions for the subtask to run."),
      canvasId: z.optional(
        z
          .string()
          .describe(
            "If blank, scope to the current canvas. If specified, the ID of the canvas to run the subagent on.",
          ),
      ),
    }),
    execute: async (ctx, { explanation, instructions, canvasId }) => {
      // Validate args here so the model gets a precise "fix your input" message
      // instead of a generic failure surfacing from deep inside the worker.
      const brief = instructions?.trim() ?? "";
      if (brief.length === 0) {
        console.warn("[run_subAgent] rejected: empty instructions", {
          explanation,
        });
        return subAgentToolError(
          "invalid_arguments",
          "`instructions` is required and cannot be empty. Pass the full brief the worker should execute.",
        );
      }

      // A blank/whitespace canvasId is not an error: fall back to the caller's
      // own canvas (the main agent's) rather than throwing.
      const targetCanvasId = canvasId?.trim() || threadCtx.canvasId;

      // Short id shared by both sides of the action boundary. It is the only
      // way to line a failure reported here up with the worker's own logs when
      // the worker was killed before it could report anything itself.
      const runId = crypto.randomUUID().slice(0, 8);
      const startedAt = Date.now();

      try {
        const result = await ctx.runAction(internal.ia.worker.startWorkerTask, {
          userId: threadCtx.authUserId,
          canvasId: targetCanvasId as Id<"canvases">,
          instructions: brief,
          // Rattache la dépense du worker à la conversation qui l'a déclenché.
          masterThreadId: ctx.threadId,
          runId,
        });

        return {
          success: true,
          result,
        };
      } catch (error) {
        const elapsedMs = Date.now() - startedAt;
        const { kind, message, details } = classifySubAgentError(error, {
          runId,
          elapsedMs,
        });
        console.error("[run_subAgent] failed", {
          runId,
          explanation,
          canvasId: targetCanvasId,
          elapsedMs,
          kind,
          message,
          details,
        });
        return subAgentToolError(kind, message, details);
      }
    },
  });
}
