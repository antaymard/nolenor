import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import { isPendingReview, type HomePendingThread } from "@/lib/threadRunStatus";

/** Les tâches en attente d'un canvas, la plus récemment active d'abord. */
export type PendingTasksByCanvas = ReadonlyMap<
  Id<"canvases">,
  HomePendingThread[]
>;

const NO_TASKS: HomePendingThread[] = [];

/**
 * Ce que Nolë a laissé en plan, rangé par workspace : la matière des pastilles
 * de la home.
 *
 * Une seule query pour toute la page, et non une par carte : les cartes se
 * comptent par dizaines, la query est la même pour toutes, et le serveur ramène
 * déjà l'ensemble trié.
 *
 * `enabled: false` coupe la requête, comme `useUserCanvases` : elle exige une
 * session, et la home la monte avant de savoir si l'auth a abouti.
 */
export function useHomePendingTasks({
  enabled = true,
}: { enabled?: boolean } = {}): PendingTasksByCanvas {
  const tasks = useQuery(
    api.threads.listPendingThreadsForUser,
    enabled ? {} : "skip",
  );

  return useMemo(() => {
    // Le serveur filtre grossièrement (il ne peut pas lire l'horloge dans une
    // query) ; la décision finale se prend ici, comme au dock. Pas de minuterie
    // à ce niveau non plus : la seule transition temporelle est `running` →
    // `stale`, et les deux sont admis — ce sont les lignes, elles, qui changent
    // d'aspect, et chacune a sa propre minuterie.
    const now = Date.now();
    const grouped = new Map<Id<"canvases">, HomePendingThread[]>();

    for (const task of tasks ?? []) {
      if (!isPendingReview(task, now)) continue;
      const existing = grouped.get(task.canvasId);
      if (existing) existing.push(task);
      else grouped.set(task.canvasId, [task]);
    }

    return grouped;
  }, [tasks]);
}

/**
 * Les tâches d'un canvas, ou un tableau vide — le même à chaque appel, pour ne
 * pas rendre inutile la mémoïsation des cartes qui le reçoivent.
 */
export function pendingTasksOf(
  tasksByCanvas: PendingTasksByCanvas,
  canvasId: Id<"canvases">,
): HomePendingThread[] {
  return tasksByCanvas.get(canvasId) ?? NO_TASKS;
}
