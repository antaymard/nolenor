import { create } from "zustand";

/**
 * Ce que Nolë fait en ce moment sur les nodes du canvas ouvert : lecture ou
 * écriture, et l'étiquette du tool call.
 *
 * Même patron que `bookmarkedNodesStore` : alimenté en un point unique
 * (`useSyncNoleLiveActivity`, appelé par `CanvasFlow`), lu node par node par
 * `NodeFrame`, qui ne s'abonne qu'à sa propre entrée — un tool qui démarre ne
 * re-rend que les nodes qu'il vise.
 */
export type NoleNodeActivity = {
  access: "read" | "write";
  label: string | null;
};

interface NoleLiveStore {
  byNodeId: Map<string, NoleNodeActivity>;
  setActivities: (byNodeId: Map<string, NoleNodeActivity>) => void;
}

function sameActivities(
  a: Map<string, NoleNodeActivity>,
  b: Map<string, NoleNodeActivity>,
): boolean {
  if (a.size !== b.size) return false;
  for (const [nodeId, activity] of a) {
    const other = b.get(nodeId);
    if (
      !other ||
      other.access !== activity.access ||
      other.label !== activity.label
    ) {
      return false;
    }
  }
  return true;
}

export const useNoleLiveStore = create<NoleLiveStore>()((set) => ({
  byNodeId: new Map(),
  // Comparaison avant écriture : la query se re-résout à chaque transition de
  // tâche, et réécrire une carte identique réveillerait tous les nodes.
  setActivities: (byNodeId) =>
    set((state) =>
      sameActivities(state.byNodeId, byNodeId) ? state : { byNodeId },
    ),
}));

/** L'activité de Nolë sur CE node, ou `undefined`. */
export function useNoleNodeActivity(
  nodeId: string,
): NoleNodeActivity | undefined {
  return useNoleLiveStore((state) => state.byNodeId.get(nodeId));
}
