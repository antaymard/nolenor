import { useCallback } from "react";
import { useMutation } from "convex/react";
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
 * Même effet que la croix du dock sur un canvas : la tâche en sort aussi.
 */
export function useClearHomeTasks(): {
  clearTasks: (tasks: { threadId: string; title: string | null }[]) => void;
  revertTasks: (threadIds: string[]) => void;
} {
  const markReviewed = useMutation(
    api.threads.markThreadReviewed,
  ).withOptimisticUpdate((store, { threadId }) => {
    const current = store.getQuery(api.threads.listPendingThreadsForUser, {});
    if (!current) return;
    // `reviewedAt` suffit à sortir la tâche de `isPendingReview` : pas besoin
    // de la retirer du tableau, et la réponse du serveur la retirera de toute
    // façon.
    store.setQuery(
      api.threads.listPendingThreadsForUser,
      {},
      current.map((task) =>
        task.threadId === threadId ? { ...task, reviewedAt: Date.now() } : task,
      ),
    );
  });
  const unmarkReviewed = useMutation(
    api.threads.unmarkThreadReviewed,
  ).withOptimisticUpdate((store, { threadId }) => {
    const current = store.getQuery(api.threads.listPendingThreadsForUser, {});
    if (!current) return;
    store.setQuery(
      api.threads.listPendingThreadsForUser,
      {},
      current.map((task) =>
        task.threadId === threadId ? { ...task, reviewedAt: null } : task,
      ),
    );
  });

  const clearTasks = useCallback(
    (tasks: { threadId: string; title: string | null }[]) => {
      if (tasks.length === 0) return;
      void Promise.all(
        tasks.map((task) => markReviewed({ threadId: task.threadId })),
      ).catch((error) => toastError(error, "Could not clear this task."));
    },
    [markReviewed],
  );

  const revertTasks = useCallback(
    (threadIds: string[]) => {
      if (threadIds.length === 0) return;
      void Promise.all(
        threadIds.map((threadId) => unmarkReviewed({ threadId })),
      ).catch((error) => toastError(error, "Could not undo."));
    },
    [unmarkReviewed],
  );

  return { clearTasks, revertTasks };
}
