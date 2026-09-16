import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  TASK_ERROR_MAX_LENGTH,
  TASK_RESULT_MAX_LENGTH,
  taskExecutionStatuses,
  type TaskExecutionStatus,
} from "../schemas/taskExecutionsSchema";

type TaskExecution = Doc<"taskExecutions">;

/**
 * Borne de lecture du lot ouvert d'un thread.
 *
 * Généreuse par rapport au plafond de concurrence (cf. `MAX_CONCURRENT_SUBAGENTS`
 * dans `ia/worker.ts`) : ce qui est lu ici, ce sont les tâches non encore
 * livrées, donc les quelques-unes qui tournent plus les rapports en attente du
 * réveil. Une conversation ne peut pas en accumuler beaucoup — mais la borne
 * existe pour que la query reste bornée le jour où un bug l'y aiderait.
 */
const MAX_OPEN_TASKS_READ = 32;

/** Tranche d'un balayage de cron. Le travail restant part au tour suivant. */
const TASK_SWEEP_BATCH_SIZE = 50;

export async function create(
  ctx: MutationCtx,
  {
    executionId,
    canvasId,
    explanation,
    instructions,
    threadId,
    masterThreadId,
  }: {
    executionId: string;
    canvasId: Id<"canvases">;
    explanation?: string;
    instructions: string;
    threadId: string;
    masterThreadId?: string;
  },
): Promise<Id<"taskExecutions">> {
  return await ctx.db.insert("taskExecutions", {
    executionId,
    canvasId,
    explanation,
    instructions,
    execution: "background",
    taskOwner: "worker",
    threadId,
    masterThreadId,
    status: taskExecutionStatuses.toRun,
  });
}

export async function findById(
  ctx: QueryCtx,
  { taskId }: { taskId: Id<"taskExecutions"> },
): Promise<TaskExecution | null> {
  return await ctx.db.get("taskExecutions", taskId);
}

export async function markRunning(
  ctx: MutationCtx,
  { taskId }: { taskId: Id<"taskExecutions"> },
): Promise<void> {
  const task = await ctx.db.get("taskExecutions", taskId);
  if (!task) return;
  // Un `stopped` posé entre le dispatch et le démarrage (l'utilisateur a coupé
  // la conversation avant que l'action ne parte) ne doit pas être ressuscité.
  if (task.status !== taskExecutionStatuses.toRun) return;

  await ctx.db.patch("taskExecutions", taskId, {
    status: taskExecutionStatuses.running,
    startedAt: Date.now(),
  });
}

/**
 * Conclut une tâche.
 *
 * Ne déloge jamais un `stopped` : l'utilisateur a coupé, le rapport qui arrive
 * après coup n'a plus à réveiller qui que ce soit. Le texte est tout de même
 * conservé — la tâche reste consultable, et c'est gratuit.
 *
 * Renvoie le statut effectivement retenu, dont l'appelant a besoin pour décider
 * s'il y a lieu de livrer.
 */
export async function markFinished(
  ctx: MutationCtx,
  {
    taskId,
    status,
    resultMessage,
    errorMessage,
  }: {
    taskId: Id<"taskExecutions">;
    status: Extract<TaskExecutionStatus, "success" | "error">;
    resultMessage?: string;
    errorMessage?: string;
  },
): Promise<TaskExecutionStatus | null> {
  const task = await ctx.db.get("taskExecutions", taskId);
  if (!task) return null;

  const wasStopped = task.status === taskExecutionStatuses.stopped;
  const nextStatus = wasStopped ? taskExecutionStatuses.stopped : status;

  await ctx.db.patch("taskExecutions", taskId, {
    status: nextStatus,
    stoppedAt: Date.now(),
    resultMessage: resultMessage?.slice(0, TASK_RESULT_MAX_LENGTH),
    errorMessage: errorMessage?.slice(0, TASK_ERROR_MAX_LENGTH),
  });

  return nextStatus;
}

/**
 * Le lot ouvert d'un thread parent : tout ce qui n'a pas encore été remis.
 *
 * C'est la seule lecture dont le fan-in a besoin. Les tâches déjà livrées sont
 * hors de la clé d'index, donc pas scannées.
 */
export async function listOpenForMaster(
  ctx: QueryCtx,
  { masterThreadId }: { masterThreadId: string },
): Promise<TaskExecution[]> {
  return await ctx.db
    .query("taskExecutions")
    .withIndex("by_masterThreadId_and_deliveredAt", (q) =>
      q.eq("masterThreadId", masterThreadId).eq("deliveredAt", undefined),
    )
    .take(MAX_OPEN_TASKS_READ);
}

/** Marque un lot comme remis. À appeler dans la transaction qui réveille. */
export async function markDelivered(
  ctx: MutationCtx,
  { tasks }: { tasks: TaskExecution[] },
): Promise<void> {
  const deliveredAt = Date.now();
  for (const task of tasks) {
    await ctx.db.patch("taskExecutions", task._id, { deliveredAt });
  }
}

/**
 * Coupe les tâches encore vivantes d'un thread parent.
 *
 * Appelé quand l'utilisateur interrompt la conversation : sans ça, les workers
 * lancés continuent et viennent réveiller le thread bien après que l'humain a
 * dit stop. L'action déjà partie n'est pas tuable — c'est le statut qui fait
 * que son rapport sera classé sans suite.
 */
export async function stopOpenForMaster(
  ctx: MutationCtx,
  { masterThreadId }: { masterThreadId: string },
): Promise<TaskExecution[]> {
  const open = await listOpenForMaster(ctx, { masterThreadId });
  const alive = open.filter(
    (task) =>
      task.status === taskExecutionStatuses.toRun ||
      task.status === taskExecutionStatuses.running,
  );

  const stoppedAt = Date.now();
  for (const task of alive) {
    await ctx.db.patch("taskExecutions", task._id, {
      status: taskExecutionStatuses.stopped,
      stoppedAt,
    });
  }

  return alive;
}

/**
 * Tâches mortes en vol : le conteneur de leur action a disparu, donc ni le
 * `finally` du worker ni son rapport ne viendront jamais.
 *
 * Sans ce ramassage, une seule tâche perdue bloque son lot POUR TOUJOURS : le
 * fan-in attend un état terminal qui n'arrivera pas, et les rapports de ses
 * sœurs ne partent jamais au parent.
 *
 * Deux passes, parce que les deux états n'ont pas la même horloge : `running`
 * se date sur `startedAt`, `to_run` sur `_creationTime` (que Convex range en
 * fin de clé d'index, donc `eq("to_run")` le trie déjà pour nous).
 */
export async function listStale(
  ctx: QueryCtx,
  { cutoff }: { cutoff: number },
): Promise<TaskExecution[]> {
  const running = await ctx.db
    .query("taskExecutions")
    .withIndex("by_status_and_startedAt", (q) =>
      q.eq("status", taskExecutionStatuses.running).lt("startedAt", cutoff),
    )
    .take(TASK_SWEEP_BATCH_SIZE);

  const neverStarted = await ctx.db
    .query("taskExecutions")
    .withIndex("by_status_and_startedAt", (q) =>
      q.eq("status", taskExecutionStatuses.toRun),
    )
    .take(TASK_SWEEP_BATCH_SIZE);

  return [
    ...running,
    ...neverStarted.filter((task) => task._creationTime < cutoff),
  ];
}

/**
 * Les threads parents qui ont un rapport en attente de remise.
 *
 * Filet du cron : le chemin normal est que le worker livre lui-même, ou que le
 * `finally` du tour parent le fasse à sa place. Reste le cas où l'action
 * parente meurt avec son conteneur — là, personne n'appelle, et c'est ce
 * balayage qui rattrape.
 */
export async function listUndeliveredMasterThreadIds(
  ctx: QueryCtx,
): Promise<string[]> {
  const finished = await Promise.all(
    [
      taskExecutionStatuses.success,
      taskExecutionStatuses.error,
      taskExecutionStatuses.stopped,
    ].map((status) =>
      ctx.db
        .query("taskExecutions")
        .withIndex("by_status_and_deliveredAt", (q) =>
          q.eq("status", status).eq("deliveredAt", undefined),
        )
        .take(TASK_SWEEP_BATCH_SIZE),
    ),
  );

  const masterThreadIds = new Set<string>();
  for (const task of finished.flat()) {
    if (task.masterThreadId) masterThreadIds.add(task.masterThreadId);
  }
  return [...masterThreadIds];
}

export { MAX_OPEN_TASKS_READ };
