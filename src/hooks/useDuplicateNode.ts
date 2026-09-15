import { useCallback } from "react";
import { useReactFlow, type Node } from "@xyflow/react";
import toast from "react-hot-toast";
import { canNodeTypeBeCreated } from "@/components/nodes/prebuilt-nodes/prebuiltNodesConfig";
import { snapshotNodesToItems } from "@/stores/nodeClipboardStore";
import { useCreateNodesFromItems } from "@/hooks/useCreateNodesFromItems";

export function useDuplicateNode() {
  const { createNodesFromItems } = useCreateNodesFromItems();
  const { getNodes } = useReactFlow();

  /**
   * Duplique un groupe de nodes en conservant leurs offsets relatifs : le
   * coin supérieur-gauche du groupe atterrit à +50/+50 de l'original — le
   * décalage historique du duplicate mono-node, appliqué à l'ancre du groupe.
   * Ne touche pas au presse-papiers Ctrl+C.
   */
  const duplicateNodes = useCallback(
    async (nodesToDuplicate: Node[]) => {
      if (nodesToDuplicate.length === 0) return;
      // `getNodes()` en plus de la sélection : résoudre la position monde d'un
      // node dupliqué depuis une frame demande de connaître la frame, qui
      // n'est pas forcément sélectionnée.
      const items = snapshotNodesToItems(nodesToDuplicate, getNodes());
      // Les positions du snapshot sont déjà en monde — c'est elles qu'il faut
      // ancrer, pas les positions brutes, qui sont relatives pour un enfant.
      const minX = Math.min(...items.map((item) => item.node.position.x));
      const minY = Math.min(...items.map((item) => item.node.position.y));
      return createNodesFromItems(
        items,
        { x: minX + 50, y: minY + 50 },
        "duplicated",
      );
    },
    [createNodesFromItems, getNodes],
  );

  const duplicateNode = useCallback(
    async (nodeToDuplicate: Node) => {
      if (!canNodeTypeBeCreated(nodeToDuplicate.type)) {
        toast("This node type can no longer be duplicated.");
        return;
      }
      return duplicateNodes([nodeToDuplicate]);
    },
    [duplicateNodes],
  );

  return { duplicateNode, duplicateNodes };
}
