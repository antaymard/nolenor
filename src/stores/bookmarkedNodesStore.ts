import { create } from "zustand";

/**
 * Les nodes que l'utilisateur a bookmarkés sur le canvas ouvert.
 *
 * Un store et pas une lecture directe de `useCanvasBookmarks` depuis
 * `NodeFrame` : ce composant est rendu une fois par node, et le brancher sur
 * la query ferait re-rendre TOUS les nodes au moindre changement de la liste
 * (un renommage, un réordonnancement). Ici chaque node s'abonne au seul
 * booléen qui le concerne, donc poser un repère n'en re-rend qu'un.
 *
 * Alimenté en un point unique (`useSyncBookmarkedNodes`, appelé par
 * `CanvasFlow`) et vidé au changement de canvas par ce même hook.
 */
interface BookmarkedNodesStore {
  /** Les llmid visés par un repère `node` ou `selection`. */
  nodeIds: Set<string>;
  setNodeIds: (nodeIds: Set<string>) => void;
}

function sameIds(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const id of a) {
    if (!b.has(id)) return false;
  }
  return true;
}

export const useBookmarkedNodesStore = create<BookmarkedNodesStore>()(
  (set) => ({
    nodeIds: new Set(),
    // Comparaison avant écriture : la query se re-résout à chaque frappe dans
    // un renommage, et réécrire un Set identique réveillerait tous les
    // abonnés pour rien.
    setNodeIds: (nodeIds) =>
      set((state) => (sameIds(state.nodeIds, nodeIds) ? state : { nodeIds })),
  }),
);

/** S'abonne au seul état de CE node. */
export function useIsNodeBookmarked(nodeId: string): boolean {
  return useBookmarkedNodesStore((state) => state.nodeIds.has(nodeId));
}
