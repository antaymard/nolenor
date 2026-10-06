import { useEffect } from "react";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import {
  useNoleLiveStore,
  type NoleNodeActivity,
} from "@/stores/noleLiveStore";

const RANK: Record<NoleNodeActivity["access"], number> = {
  write: 2,
  read: 1,
  written: 0,
};

/**
 * Alimente `noleLiveStore` à partir de l'activité des runs sur le canvas (cf.
 * convex/harness/live.ts). Le plus fort l'emporte sur un même node : écriture
 * en cours, puis lecture en cours, puis « déjà écrit ».
 */
export function useSyncNoleLiveActivity(
  canvasId: Id<"canvases"> | undefined,
): void {
  const { isAuthenticated } = useConvexAuth();
  const activity = useQuery(
    api.harness.live.listLiveActivity,
    canvasId && isAuthenticated ? { canvasId } : "skip",
  );
  const setActivities = useNoleLiveStore((state) => state.setActivities);

  useEffect(() => {
    const byNodeId = new Map<string, NoleNodeActivity>();
    const offer = (nodeId: string, next: NoleNodeActivity) => {
      const existing = byNodeId.get(nodeId);
      if (existing && RANK[existing.access] >= RANK[next.access]) return;
      byNodeId.set(nodeId, next);
    };
    for (const call of activity?.calls ?? []) {
      for (const nodeId of call.nodeIds) {
        offer(nodeId, { access: call.access, label: call.explanation });
      }
    }
    for (const { nodeId } of activity?.written ?? []) {
      offer(nodeId, { access: "written", label: null });
    }
    setActivities(byNodeId);
  }, [activity, setActivities]);

  // Le canvas change : on vide sans attendre la nouvelle réponse — les ids de
  // nodes ne sont uniques que par canvas.
  useEffect(() => {
    return () => setActivities(new Map());
  }, [canvasId, setActivities]);
}
