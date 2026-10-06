import { useEffect } from "react";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import {
  useNoleLiveStore,
  type NoleNodeActivity,
} from "@/stores/noleLiveStore";

/**
 * Alimente `noleLiveStore` à partir des tool calls en cours sur le canvas (cf.
 * convex/harness/live.ts). Une écriture l'emporte sur une lecture quand deux
 * tools visent le même node.
 */
export function useSyncNoleLiveActivity(
  canvasId: Id<"canvases"> | undefined,
): void {
  const { isAuthenticated } = useConvexAuth();
  const calls = useQuery(
    api.harness.live.listLiveToolCalls,
    canvasId && isAuthenticated ? { canvasId } : "skip",
  );
  const setActivities = useNoleLiveStore((state) => state.setActivities);

  useEffect(() => {
    const byNodeId = new Map<string, NoleNodeActivity>();
    for (const call of calls ?? []) {
      for (const nodeId of call.nodeIds) {
        const existing = byNodeId.get(nodeId);
        if (existing?.access === "write") continue;
        byNodeId.set(nodeId, {
          access: call.access,
          label: call.explanation,
        });
      }
    }
    setActivities(byNodeId);
  }, [calls, setActivities]);

  // Le canvas change : on vide sans attendre la nouvelle réponse — les ids de
  // nodes ne sont uniques que par canvas.
  useEffect(() => {
    return () => setActivities(new Map());
  }, [canvasId, setActivities]);
}
