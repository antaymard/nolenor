import { useCallback, useMemo } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import { toastError } from "@/components/utils/errorUtils";

/**
 * Les canvases de l'utilisateur, séparés en « les siens » et « partagés avec
 * lui », plus la suppression.
 *
 * Partagé par la sidebar desktop et le switcher mobile : seul le markup diffère
 * (liens repliables d'un côté, sheet de l'autre), la donnée et les actions non.
 *
 * `enabled: false` coupe la requête : la query exige une session, donc les
 * appelants montés hors zone authentifiée (command center global) doivent
 * attendre l'auth avant de la déclencher.
 */
export function useUserCanvases({ enabled = true }: { enabled?: boolean } = {}) {
  const userCanvases = useQuery(
    api.canvases.listUserCanvases,
    enabled ? {} : "skip",
  );
  const deleteCanvasMutation = useMutation(api.canvases.deleteCanvas);

  const { ownCanvases, sharedCanvases } = useMemo(() => {
    const all = userCanvases ?? [];
    return {
      ownCanvases: all.filter((canvas) => !("shared" in canvas)),
      sharedCanvases: all.filter((canvas) => "shared" in canvas),
    };
  }, [userCanvases]);

  /** `true` si la suppression a abouti — l'appelant qui affiche le canvas
   *  supprimé doit alors quitter son URL, devenue un cul-de-sac. */
  const deleteCanvas = useCallback(
    async (canvasId: Id<"canvases">): Promise<boolean> => {
      try {
        await deleteCanvasMutation({ canvasId });
        return true;
      } catch (error) {
        toastError(error, "Error deleting workspace.");
        return false;
      }
    },
    [deleteCanvasMutation],
  );

  return {
    userCanvases,
    ownCanvases,
    sharedCanvases,
    isLoading: enabled && userCanvases === undefined,
    deleteCanvas,
  };
}
