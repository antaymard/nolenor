import { useCallback } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import { toastError } from "@/components/utils/errorUtils";

/**
 * Les conversations d'un canvas et leur suppression, partagées entre le
 * sélecteur desktop (`ThreadSelector`) et la sheet mobile.
 */
export function useCanvasThreads(canvasId: Id<"canvases"> | undefined) {
  const threads = useQuery(
    api.threads.listCanvasThreads,
    canvasId ? { canvasId } : "skip",
  );
  const deleteThreadAction = useAction(api.threads.deleteThread);

  const deleteThread = useCallback(
    async (threadId: string) => {
      try {
        await deleteThreadAction({ threadId });
      } catch (error) {
        toastError(error, "Error deleting thread.");
      }
    },
    [deleteThreadAction],
  );

  return { threads, deleteThread };
}
