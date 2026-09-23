import { useCallback } from "react";
import { useMutation } from "convex/react";
import toast from "react-hot-toast";
import { api } from "@/../convex/_generated/api";
import { toastError } from "@/components/utils/errorUtils";

/** Le temps de se raviser : assez pour lire le toast, pas assez pour l'oublier. */
const UNDO_WINDOW_MS = 6000;

/**
 * Accuse réception de tâches depuis la home, avec un « Undo ».
 *
 * La ligne disparaît tout de suite (update optimiste sur la query de la home),
 * puis un toast propose de revenir en arrière. Clear depuis une liste, c'est
 * un geste rapide qu'on fait en série : un mauvais clic ne doit pas faire perdre
 * la trace d'un travail qu'on n'a pas lu.
 *
 * Même effet que la croix du dock sur un canvas : la tâche en sort aussi.
 */
export function useClearHomeTasks(): (
  tasks: { threadId: string; title: string | null }[],
) => void {
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
  const unmarkReviewed = useMutation(api.threads.unmarkThreadReviewed);

  return useCallback(
    (tasks) => {
      if (tasks.length === 0) return;

      const ids = tasks.map((task) => task.threadId);
      void Promise.all(
        ids.map((threadId) => markReviewed({ threadId })),
      ).catch((error) => toastError(error, "Could not clear this task."));

      const label =
        tasks.length === 1
          ? `“${tasks[0].title || "Nolë"}” cleared`
          : `${tasks.length} tasks cleared`;

      toast(
        (t) => (
          <span className="flex items-center gap-3 text-sm">
            <span className="min-w-0 truncate">{label}</span>
            <button
              type="button"
              onClick={() => {
                toast.dismiss(t.id);
                void Promise.all(
                  ids.map((threadId) => unmarkReviewed({ threadId })),
                ).catch((error) => toastError(error, "Could not undo."));
              }}
              className="shrink-0 rounded-md px-2 py-1 text-sm font-semibold text-brand hover:bg-brand/10"
            >
              Undo
            </button>
          </span>
        ),
        { duration: UNDO_WINDOW_MS },
      );
    },
    [markReviewed, unmarkReviewed],
  );
}
