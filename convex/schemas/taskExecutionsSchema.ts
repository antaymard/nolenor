import { v, type Infer } from "convex/values";

/**
 * États d'une délégation à un sous-agent.
 *
 * `to_run` n'est pas un état d'attente long : la ligne est écrite dans la même
 * transaction que le `scheduler.runAfter` qui la fera passer à `running`. Il
 * existe pour que le lot soit complet dès le dispatch — sans lui, une tâche
 * planifiée mais pas encore démarrée serait invisible du comptage de fan-in, et
 * les rapports de ses sœurs partiraient au parent sans elle.
 */
const taskExecutionStatuses = {
  toRun: "to_run",
  running: "running",
  success: "success",
  stopped: "stopped",
  error: "error",
} as const;

const taskExecutionStatusValidator = v.union(
  v.literal(taskExecutionStatuses.toRun),
  v.literal(taskExecutionStatuses.running),
  v.literal(taskExecutionStatuses.success),
  v.literal(taskExecutionStatuses.stopped),
  v.literal(taskExecutionStatuses.error),
);

/** États terminaux : la tâche ne bougera plus, son rapport est livrable. */
const TASK_EXECUTION_FINAL_STATUSES = [
  taskExecutionStatuses.success,
  taskExecutionStatuses.stopped,
  taskExecutionStatuses.error,
] as const;

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
  // `supervisor` a disparu avec `createSupervisorAgent` (cf. ia/agents.ts) :
  // il ne reste qu'un seul type d'exécutant.
  taskOwner: v.optional(v.literal("worker")),

  threadId: v.optional(v.string()), // the threadId of the task
  masterThreadId: v.optional(v.string()), // the threadId of the root task in the thread

  status: taskExecutionStatusValidator,
  startedAt: v.optional(v.number()), // timestamp of when the task started
  stoppedAt: v.optional(v.number()), // timestamp of when the task stopped
  resultMessage: v.optional(v.string()), // the result message of the task, if any
  errorMessage: v.optional(v.string()), // the error message of the task, if any

  /**
   * Date à laquelle le rapport a été remis au thread parent.
   *
   * C'est le verrou du fan-in, et il vaut mieux qu'un booléen : la remise est
   * écrite dans la MÊME transaction que le réveil du parent, donc deux
   * appelants concurrents de `deliverIfReady` ne peuvent pas réveiller deux
   * fois — le perdant de l'OCC relit et ne trouve plus rien à livrer.
   *
   * `undefined` sur une tâche encore en cours comme sur un rapport en attente :
   * c'est `status` qui distingue les deux.
   */
  deliveredAt: v.optional(v.number()),
});

/** `resultMessage` est réinjecté dans le contexte du parent : on le borne. */
const TASK_RESULT_MAX_LENGTH = 12_000;

/** `errorMessage` est affiché et relu par le modèle : une phrase, pas une stack. */
const TASK_ERROR_MAX_LENGTH = 300;

type TaskExecutionStatus = Infer<typeof taskExecutionStatusValidator>;

export {
  taskExecutionsValidator,
  taskExecutionStatuses,
  taskExecutionStatusValidator,
  TASK_EXECUTION_FINAL_STATUSES,
  TASK_RESULT_MAX_LENGTH,
  TASK_ERROR_MAX_LENGTH,
  type TaskExecutionStatus,
};
