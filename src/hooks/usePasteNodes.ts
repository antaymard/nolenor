import { useCallback } from "react";
import { useReactFlow, type XYPosition } from "@xyflow/react";
import toast from "react-hot-toast";
import { useCreateNode } from "@/hooks/useCreateNode";
import { useNodeClipboardStore } from "@/stores/nodeClipboardStore";
import { canNodeTypeBeCreated } from "@/components/nodes/prebuilt-nodes/prebuiltNodesConfig";

/**
 * Colle le contenu du presse-papiers interne (Ctrl+C sur le canvas).
 *
 * Le coin supérieur-gauche du groupe — `min(x), min(y)` des nodes copiés —
 * est posé au point donné (le curseur suivi, comme les raccourcis de
 * création) ; chaque node garde son offset relatif à cette ancre. Un seul
 * node copié atterrit donc exactement pointeur = coin haut-gauche.
 *
 * Ni focus volé (`autoEdit: false`, contrairement aux créations vierges), ni
 * edge recréé : comme `duplicateNode`, on ne duplique que le node et ses
 * values. Les nodes collés deviennent la nouvelle sélection.
 */
export function usePasteNodes() {
  const { createNode } = useCreateNode();
  const { setNodes } = useReactFlow();

  const pasteNodesAt = useCallback(
    async (position: XYPosition): Promise<void> => {
      const items = useNodeClipboardStore.getState().items;
      if (items.length === 0) return;

      // Un type devenu non créable depuis la copie est skippé, pas bloquant.
      const pastable = items.filter((item) =>
        canNodeTypeBeCreated(item.node.type),
      );
      if (pastable.length < items.length) {
        toast("Some node types can no longer be pasted.");
      }
      if (pastable.length === 0) return;

      const minX = Math.min(...pastable.map((item) => item.node.position.x));
      const minY = Math.min(...pastable.map((item) => item.node.position.y));

      const pastedIds: string[] = [];
      for (const item of pastable) {
        const { nodeId } = await createNode({
          node: item.node,
          position: {
            x: position.x + (item.node.position.x - minX),
            y: position.y + (item.node.position.y - minY),
          },
          initialValues: item.values,
          // Sélection posée d'un bloc à la fin : avec `selectNewNode: true`,
          // chaque création désélectionnerait la précédente et ne resterait
          // que le dernier node du groupe.
          selectNewNode: false,
        });
        pastedIds.push(nodeId);
      }

      setNodes((nodes) =>
        nodes.map((node) => ({
          ...node,
          selected: pastedIds.includes(node.id),
        })),
      );
    },
    [createNode, setNodes],
  );

  return { pasteNodesAt };
}
