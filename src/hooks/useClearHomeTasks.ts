import { useCallback } from "react";
import { useMutation } from "convex/react";
import type { Id } from "@/../convex/_generated/dataModel";
import { api } from "@/../convex/_generated/api";
import { toastError } from "@/components/utils/errorUtils";

/**
 * Accuse réception de tâches depuis la home, avec un revert éphémère porté
 * par la ligne elle-même (pas de toast).
 *
 * La mutation est immédiate ; c'est l'UI (`TaskList`) qui garde la ligne
 * visible quelques secondes en état « acquittée » avec un bouton Undo.
 * Quitter la page avant la fin du délai ne change rien : le serveur a déjà
 * enregistré l'acquittement.
 *
 * Même effet que la croix d'une carte sur un canvas : la tâche en sort aussi.
 */
export function useClearHomeTasks(): {
  clearTasks: (tasks: { runId: Id<"runs"> }[]) => void;
  revertTasks: (runIds: Id<"runs">[]) => void;
} {
  const markReviewed = useMutation(
    api.runs.markRunReviewed,
  ).withOptimisticUpdate((store, { runId }) => {
    const current = store.getQuery(api.runs.listPendingRunsForUser, {});
    if (!current) return;
    store.setQuery(
      api.runs.listPendingRunsForUser,
      {},
      current.filter((task) => task.runId !== runId),
    );
  });
  // Pas d'update optimiste : la ligne revient avec la réponse du serveur
  // (la query ne renvoie que les tâches à relire).
  const unmarkReviewed = useMutation(api.runs.unmarkRunReviewed);

  const clearTasks = useCallback(
    (tasks: { runId: Id<"runs"> }[]) => {
      if (tasks.length === 0) return;
      void Promise.all(
        tasks.map((task) => markReviewed({ runId: task.runId })),
      ).catch((error) => toastError(error, "Could not clear this task."));
    },
    [markReviewed],
  );

  const revertTasks = useCallback(
    (runIds: Id<"runs">[]) => {
      if (runIds.length === 0) return;
      void Promise.all(
        runIds.map((runId) => unmarkReviewed({ runId })),
      ).catch((error) => toastError(error, "Could not undo."));
    },
    [unmarkReviewed],
  );

  return { clearTasks, revertTasks };
}
