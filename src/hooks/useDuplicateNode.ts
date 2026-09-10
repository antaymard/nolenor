import { useCallback } from "react";
import type { Node } from "@xyflow/react";
import toast from "react-hot-toast";
import { canNodeTypeBeCreated } from "@/components/nodes/prebuilt-nodes/prebuiltNodesConfig";
import { snapshotNodesToItems } from "@/stores/nodeClipboardStore";
import { useCreateNodesFromItems } from "@/hooks/useCreateNodesFromItems";

export function useDuplicateNode() {
  const { createNodesFromItems } = useCreateNodesFromItems();

  /**
   * Duplique un groupe de nodes en conservant leurs offsets relatifs : le
   * coin supérieur-gauche du groupe atterrit à +50/+50 de l'original — le
   * décalage historique du duplicate mono-node, appliqué à l'ancre du groupe.
   * Ne touche pas au presse-papiers Ctrl+C.
   */
  const duplicateNodes = useCallback(
    async (nodesToDuplicate: Node[]) => {
      if (nodesToDuplicate.length === 0) return;
      const items = snapshotNodesToItems(nodesToDuplicate);
      const minX = Math.min(...nodesToDuplicate.map((n) => n.position.x));
      const minY = Math.min(...nodesToDuplicate.map((n) => n.position.y));
      return createNodesFromItems(
        items,
        { x: minX + 50, y: minY + 50 },
        "duplicated",
      );
    },
    [createNodesFromItems],
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
