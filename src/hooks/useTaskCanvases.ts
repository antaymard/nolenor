import { useMemo } from "react";
import type { Id } from "@/../convex/_generated/dataModel";
import type { TaskCanvasInfo } from "@/components/home/TaskList";
import { useUserCanvases } from "@/hooks/useUserCanvases";
import { canvasCover } from "@/lib/canvasCover";

/**
 * Les canvas que l'utilisateur voit, tels qu'une liste de tâches les nomme :
 * leur nom et leur couleur de couverture.
 *
 * Sert aussi de filtre. Les tâches viennent des threads de l'utilisateur, pas
 * de ses canvas (cf. `threads.listPendingThreadsForUser`) : un partage révoqué
 * laisse des tâches qui pointent vers un canvas qu'il ne voit plus. Une tâche
 * absente de cette map n'est ni listée ni comptée.
 *
 * `useUserCanvases` est monté par ailleurs sur la même page : Convex ne tient
 * qu'un abonnement pour deux `useQuery` identiques.
 */
export function useTaskCanvases({
  enabled = true,
}: { enabled?: boolean } = {}): ReadonlyMap<Id<"canvases">, TaskCanvasInfo> {
  const { userCanvases } = useUserCanvases({ enabled });

  return useMemo(
    () =>
      new Map(
        (userCanvases ?? []).map((canvas) => [
          canvas._id,
          { name: canvas.name, cover: canvasCover(canvas._id) },
        ]),
      ),
    [userCanvases],
  );
}
