"use node";
// Action Node : les tools de Nolë chargent jsdom / @blocknote/core au moment
// de l'exécution (lecture et écriture de blocknote, tables riches).
import type { ToolCtx } from "@convex-dev/agent";
import type { ToolSet } from "ai";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import {
  attachToolCtx,
  compactErrorMessage,
  toolError,
} from "../ia/tools/toolHelpers";
import { getProfile } from "./profiles";
import type { ToolResultOutput } from "./transcript";

/**
 * Exécute UNE tâche tool : claim (intention enregistrée), exécution, puis
 * `tasks.completeTool`, qui écrit le résultat et l'état terminal ensemble et
 * enchaîne la génération suivante si c'était le dernier tool du round.
 */

type AgentTool = ToolSet[string];

const INTERRUPTED_MESSAGE =
  "This tool call was interrupted before it completed: its effects are " +
  "unknown. Check the current state (for example by reading the nodes " +
  "involved) before retrying.";

/** Un tool peut rendre un AsyncIterable (sorties progressives) : on garde la dernière. */
async function resolveToolOutput(raw: unknown): Promise<unknown> {
  const resolved = await Promise.resolve(raw);
  if (
    resolved !== null &&
    typeof resolved === "object" &&
    Symbol.asyncIterator in resolved
  ) {
    let last: unknown = null;
    for await (const chunk of resolved as AsyncIterable<unknown>) {
      last = chunk;
    }
    return last;
  }
  return resolved;
}

/**
 * La sortie telle que le modèle la verra, selon la règle de l'AI SDK : le
 * `toModelOutput` du tool s'il en a un (parts image de read_nodes et
 * view_image), sinon `text` pour une chaîne et `json` pour le reste.
 */
async function toModelOutput(
  tool: AgentTool,
  call: { toolCallId: string; input: unknown },
  output: unknown,
): Promise<ToolResultOutput> {
  if (typeof tool.toModelOutput === "function") {
    return (await tool.toModelOutput.call(tool, {
      toolCallId: call.toolCallId,
      input: call.input,
      output,
    })) as ToolResultOutput;
  }
  if (typeof output === "string") return { type: "text", value: output };
  return {
    type: "json",
    value: JSON.parse(JSON.stringify(output ?? null)),
  };
}

export const run = internalAction({
  args: { taskId: v.id("agentTasks") },
  handler: async (ctx, { taskId }) => {
    const claim = await ctx.runMutation(internal.harness.tasks.claimTool, {
      taskId,
    });
    if (!claim) return null;
    const { attempt, run, toolCallId, toolName, input } = claim;

    const complete = (
      status: "completed" | "failed" | "interrupted",
      output: ToolResultOutput,
      error?: string,
    ) =>
      ctx.runMutation(internal.harness.tasks.completeTool, {
        taskId,
        attempt,
        status,
        output,
        error,
      });

    // Reprise d'un appel déjà démarré : on ne relance que ce qui ne peut rien
    // dupliquer.
    if (claim.mode === "recover" && claim.replay !== "safe") {
      await complete(
        "interrupted",
        { type: "error-text", value: INTERRUPTED_MESSAGE },
        "Interrupted",
      );
      return null;
    }

    const profile = getProfile(claim.profile);
    const tool = profile.tools(run)[toolName];
    if (!tool || typeof tool.execute !== "function") {
      await complete(
        "failed",
        { type: "error-text", value: toolError(`Unknown tool "${toolName}".`) },
        "Unknown tool",
      );
      return null;
    }

    // Le ctx que le composant agent pose sur un tool avant de l'appeler (cf.
    // ia/tools/toolHelpers.ts) : les tools y lisent `threadId`.
    const toolCtx: ToolCtx = {
      ...ctx,
      userId: run.userId,
      threadId: run.threadId,
      messageId: claim.promptMessageId,
    };
    const wrapped = attachToolCtx(tool, toolCtx);

    let output: unknown;
    try {
      output = await resolveToolOutput(
        wrapped.execute!(input, { toolCallId, messages: [] }),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Même forme que l'AI SDK pour un tool qui throw, message compacté.
      await complete(
        "failed",
        { type: "error-text", value: compactErrorMessage(message) },
        message,
      );
      return null;
    }

    await complete(
      "completed",
      await toModelOutput(wrapped, { toolCallId, input }, output),
    );
    return null;
  },
});
