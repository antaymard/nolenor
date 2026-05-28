import { v } from "convex/values";

const taskExecutionsValidator = v.object({
  executionId: v.string(), // llmId, given to the llm for tracking as agentId
  canvasId: v.id("canvases"),

  explanation: v.optional(v.string()),
  attachments: v.optional(
    v.array(
      v.object({
        id: v.string(),
        type: v.union(v.literal("node"), v.literal("tool_result")),
        explanation: v.optional(v.string()),
      }),
    ),
  ),
  instructions: v.string(),
  outputNodeId: v.optional(v.string()), // if blank, the task is expected to return a result message. If set, the task is expected to write its result to the specified node.
  execution: v.union(v.literal("background"), v.literal("synchronous")),
  taskOwner: v.optional(v.union(v.literal("supervisor"), v.literal("worker"))),

  threadId: v.optional(v.string()), // the threadId of the task
  masterThreadId: v.optional(v.string()), // the threadId of the root task in the thread

  status: v.union(
    v.literal("to_run"),
    v.literal("running"),
    v.literal("success"),
    v.literal("stopped"),
    v.literal("error"),
  ),
  startedAt: v.optional(v.number()), // timestamp of when the task started
  stoppedAt: v.optional(v.number()), // timestamp of when the task stopped
  resultMessage: v.optional(v.string()), // the result message of the task, if any
  errorMessage: v.optional(v.string()), // the error message of the task, if any
});

export { taskExecutionsValidator };
