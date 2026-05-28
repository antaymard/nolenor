import { createTool } from "@convex-dev/agent";
import { z } from "zod";
import { type ToolConfig, toolError } from "./toolHelpers";
import { toolAgentNames, type ThreadCtx } from "../agentConfig";
import { internal } from "../../_generated/api";

// Worker cannot run subtasks itself.
export const executeTaskToolConfig: ToolConfig = {
  name: "execute_task",
  authorized_agents: [
    toolAgentNames.nole,
    toolAgentNames.clone,
    toolAgentNames.supervisor,
  ],
};

export default function executeTaskTool({
  threadCtx,
}: {
  threadCtx: ThreadCtx;
}) {
  return createTool({
    description: `Spawn a worker subagent to handle a self-contained task off your context window. The worker has full tool access (read, write, edit, web). It runs in isolation, executes the brief, and returns a single final message — every intermediate tool call is invisible to you.
    
    The worker starts cold. It cannot see your conversation, prior tool calls, or scratchpad. Its entire universe is the prompt you pass. Hand it every fact it needs: node ids, sources, what the user actually asked, what you've already ruled out, the shape of the answer you want back, the form of the output (node edition/creation or simple result message given back to you).

    Use when: research synthesis, canvas or codebase exploration, batch canvas/nodes work, long but trivial tasks, anything that would otherwise flood your context with intermediate output you don't need.
    Do not use when: a single Read or Search would do; the task is one or two steps; you don't yet know the shape of the answer (probe inline first); you need to make the judgment call yourself — delegate the legwork, never the decision.
    
    The worker cannot ask you clarifying questions and cannot spawn further workers. Multiple independent sub-tasks should be issued as a parallel batch from your level, not as a chain. 
    
    Brief format: state the goal and why it matters; cite concrete entry points (nodes, symbols, URLs); say what's already known or ruled out; specify the shape and length of the answer expected; specify the output format (node or message); cap scope and depth when relevant.
    
    Trust but verify: the worker's final message describes what it intended to do, not necessarily what it did. If it wrote or edited files, check the diff before acting on the report.
    
    Feel free to call this tool multiple times in parallel with different briefs, when the tasks are independent and can be done in any order. For dependent tasks, break them down and call sequentially with updated briefs based on the previous worker's report.`,
    inputSchema: z.object({
      explanation: z
        .string()
        .describe("3-5 words explaining the research intent."),
      instructions: z.string().describe("Instructions for the subtask to run."),
    }),
    execute: async (ctx, { instructions }) => {
      try {
        const result = await ctx.runAction(internal.ia.worker.startWorkerTask, {
          userId: threadCtx.authUserId,
          canvasId: threadCtx.canvasId,
          instructions,
        });

        return {
          success: true,
          result,
        };

        // SYNC EXECUTION FLOW:
        // Run the subThread now

        // ASYNC EXECUTION FLOW:
        // 1. Create a task execution record in the database with status "to-run" and all the fields for init

        // 2. EXECUTION : launch the scheduler to pick up the task and execute it & return the executionId to the mainAgent (masterThreadId)

        // Front side, the toolcard get the id from the return of the tool execution, and then subscribe to the updates of the task execution

        // Placeholder for actual subtask execution logic
      } catch (error: any) {
        console.error("❌ Task execution error:", error);
        return toolError(
          `Task execution failed: ${error.message}. Please try again.`,
        );
      }
    },
  });
}
