import { create } from "zustand";
import type { Node } from "@xyflow/react";
import { useNodeDataStore } from "@/stores/nodeDataStore";
import { getNodeDataId } from "@/lib/nodeIdentity";
import { valuesToDuplicate } from "@/lib/nodeDuplicateValues";

export type NodeClipboardItem = {
  /**
   * Le node tel qu'il sera recréé : `id` vidé (regénéré à la création),
   * `data` sans `nodeDataId` (nouveau doc `nodeDatas` à la création),
   * `position` d'origine conservée pour recalculer les offsets relatifs du
   * groupe au moment du coller.
   */
  node: Node;
  /** Snapshot des values au moment du Ctrl+C, déjà filtré (`valuesNotDuplicated`). */
  values: Record<string, unknown>;
};

interface NodeClipboardStore {
  items: NodeClipboardItem[];
  /** Incrémenté à chaque copie : signature stable pour la garde anti-doublon du coller. */
  seq: number;
  setClipboard: (items: NodeClipboardItem[]) => void;
  clearClipboard: () => void;
}

export const useNodeClipboardStore = create<NodeClipboardStore>()((set) => ({
  items: [],
  seq: 0,
  setClipboard: (items) =>
    set((state) => ({ items, seq: state.seq + 1 })),
  clearClipboard: () => set({ items: [] }),
}));

/**
 * Photographie les nodes sélectionnés dans le presse-papiers interne
 * (mémoire du front, pas de clipboard système : pas de permission async, et le
 * contenu survit au changement de canvas — les values sont autoporteuses).
 *
 * Sélection vide → no-op : on n'efface pas un coller en attente par accident.
 */
export function copyNodesToClipboard(nodes: Node[]): boolean {
  if (nodes.length === 0) return false;

  const getNodeData = useNodeDataStore.getState().getNodeData;
  const items: NodeClipboardItem[] = nodes.map((node) => {
    let values: Record<string, unknown> = {};
    const nodeDataId = getNodeDataId(node);
    if (nodeDataId) {
      const nodeData = getNodeData(nodeDataId);
      if (nodeData) {
        values = valuesToDuplicate(
          nodeData.type,
          nodeData.values as Record<string, unknown>,
        );
      }
    }

    const { nodeDataId: _omitted, ...data } = (node.data ?? {}) as Record<
      string,
      unknown
    >;
    return {
      node: { ...node, id: "", selected: false, data },
      values,
    };
  });

  useNodeClipboardStore.getState().setClipboard(items);
  return true;
}
