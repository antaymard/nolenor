import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import {
  resolveRunStatus,
  runStatusUrgency,
  runTimeAnchor,
  type HomePendingTask,
} from "@/lib/threadRunStatus";

/** Les tâches en attente d'un canvas, la plus récemment active d'abord. */
export type PendingTasksByCanvas = ReadonlyMap<
  Id<"canvases">,
  HomePendingTask[]
>;

export type HomePendingTasks = {
  /** Toutes les tâches, ce qui appelle l'utilisateur d'abord : l'échec, puis
   *  ce qui n'a pas abouti, puis ce qui tourne, puis ce qui est fini — et à
   *  urgence égale, la plus récente. C'est l'ordre de la liste de la home. */
  tasks: HomePendingTask[];
  /** Les mêmes, rangées par canvas : la matière des pastilles de cartes. */
  byCanvas: PendingTasksByCanvas;
  isLoading: boolean;
};

const NO_TASKS: HomePendingTask[] = [];

/**
 * Ce que Nolë a laissé en plan, tous workspaces confondus : la liste de la home
 * et de l'Inbox, et les pastilles des cartes.
 *
 * Une seule query pour toute la page, et non une par carte : les cartes se
 * comptent par dizaines, la query est la même pour toutes, et le serveur ramène
 * déjà l'ensemble trié.
 *
 * `enabled: false` coupe la requête, comme `useUserCanvases` : elle exige une
 * session.
 */
export function useHomePendingTasks({
  enabled = true,
}: { enabled?: boolean } = {}): HomePendingTasks {
  const result = useQuery(
    api.runs.listPendingRunsForUser,
    enabled ? {} : "skip",
  );

  return useMemo(() => {
    // Le serveur ne renvoie que les tâches à relire.
    const pending = result ?? NO_TASKS;

    const urgency = new Map(
      pending.map((task) => [
        task.runId,
        runStatusUrgency(resolveRunStatus(task)),
      ]),
    );
    const tasks = [...pending].sort(
      (a, b) =>
        (urgency.get(b.runId) ?? 0) - (urgency.get(a.runId) ?? 0) ||
        (runTimeAnchor(b) ?? 0) - (runTimeAnchor(a) ?? 0),
    );

    // Les pastilles gardent l'ordre du serveur (dernière tâche d'abord) :
    // elles n'affichent que la plus fraîche et le statut dominant.
    const byCanvas = new Map<Id<"canvases">, HomePendingTask[]>();
    for (const task of pending) {
      const existing = byCanvas.get(task.canvasId);
      if (existing) existing.push(task);
      else byCanvas.set(task.canvasId, [task]);
    }

    return {
      tasks,
      byCanvas,
      isLoading: enabled && result === undefined,
    };
  }, [result, enabled]);
}

/**
 * Les tâches d'un canvas, ou un tableau vide — le même à chaque appel, pour ne
 * pas rendre inutile la mémoïsation des cartes qui le reçoivent.
 */
export function pendingTasksOf(
  tasksByCanvas: PendingTasksByCanvas,
  canvasId: Id<"canvases">,
): HomePendingTask[] {
  return tasksByCanvas.get(canvasId) ?? NO_TASKS;
}
