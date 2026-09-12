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
 * Photographie des nodes : snapshot des values au moment de l'appel, déjà
 * filtré (`valuesNotDuplicated`), `data` sans `nodeDataId` (nouveau doc
 * `nodeDatas` à la création) ni `order` (rang propre à l'original). Pur
 * vis-à-vis du store : ne touche pas au presse-papiers — le duplicate
 * l'utilise directement pour ne pas écraser un Ctrl+C en attente.
 */
export function snapshotNodesToItems(nodes: Node[]): NodeClipboardItem[] {
  const getNodeData = useNodeDataStore.getState().getNodeData;
  return nodes.map((node) => {
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

    // `order` retiré comme `nodeDataId` : c'est le rang du node *original*
    // dans la liste des repères de navigation. Le recopier collerait la
    // copie sur son modèle ; sans lui, elle atterrit en fin de liste
    // (cf. `sortMarkers`).
    const {
      nodeDataId: _omitted,
      order: _orderOmitted,
      ...data
    } = (node.data ?? {}) as Record<string, unknown>;
    return {
      node: { ...node, id: "", selected: false, data },
      values,
    };
  });
}

/**
 * Photographie les nodes sélectionnés dans le presse-papiers interne
 * (mémoire du front, pas de clipboard système : pas de permission async, et le
 * contenu survit au changement de canvas — les values sont autoporteuses).
 *
 * Sélection vide → no-op : on n'efface pas un coller en attente par accident.
 */
export function copyNodesToClipboard(nodes: Node[]): boolean {
  if (nodes.length === 0) return false;
  useNodeClipboardStore.getState().setClipboard(snapshotNodesToItems(nodes));
  return true;
}
