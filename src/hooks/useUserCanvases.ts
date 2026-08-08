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
 */
export function useUserCanvases() {
  const userCanvases = useQuery(api.canvases.listUserCanvases);
  const deleteCanvasMutation = useMutation(api.canvases.deleteCanvas);

  const { ownCanvases, sharedCanvases } = useMemo(() => {
    const all = userCanvases ?? [];
    return {
      ownCanvases: all.filter((canvas) => !("shared" in canvas)),
      sharedCanvases: all.filter((canvas) => "shared" in canvas),
    };
  }, [userCanvases]);

  const deleteCanvas = useCallback(
    async (canvasId: Id<"canvases">) => {
      try {
        await deleteCanvasMutation({ canvasId });
      } catch (error) {
        toastError(error, "Error deleting workspace.");
      }
    },
    [deleteCanvasMutation],
  );

  return {
    userCanvases,
    ownCanvases,
    sharedCanvases,
    isLoading: userCanvases === undefined,
    deleteCanvas,
  };
}
