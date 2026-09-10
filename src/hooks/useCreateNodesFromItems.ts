import { useCallback } from "react";
import { useReactFlow, type XYPosition } from "@xyflow/react";
import toast from "react-hot-toast";
import { useCreateNode } from "@/hooks/useCreateNode";
import type { NodeClipboardItem } from "@/stores/nodeClipboardStore";
import { canNodeTypeBeCreated } from "@/components/nodes/prebuilt-nodes/prebuiltNodesConfig";

/**
 * La fabrique partagée du coller (Ctrl+V) et du duplicate (Ctrl+D) : recrée
 * un groupe de nodes à partir d'items snapshotés.
 *
 * `anchor` est la position où atterrit le coin supérieur-gauche du groupe —
 * `min(x), min(y)` des items d'origine ; chaque node garde son offset relatif
 * à cette ancre. Le coller y passe le curseur suivi, le duplicate l'ancre
 * d'origine décalée de +50/+50.
 *
 * Ni focus volé (`autoEdit: false`), ni edge recréé : on ne duplique que le
 * node et ses values. Les nodes créés deviennent la nouvelle sélection
 * (posée d'un bloc à la fin : créer avec `selectNewNode: true` en boucle ne
 * laisserait que le dernier sélectionné).
 */
export function useCreateNodesFromItems() {
  const { createNode } = useCreateNode();
  const { setNodes } = useReactFlow();

  const createNodesFromItems = useCallback(
    async (
      items: NodeClipboardItem[],
      anchor: XYPosition,
      verb: "pasted" | "duplicated" = "pasted",
    ): Promise<void> => {
      if (items.length === 0) return;

      // Un type devenu non créable depuis le snapshot est skippé, pas bloquant.
      const creatable = items.filter((item) =>
        canNodeTypeBeCreated(item.node.type),
      );
      if (creatable.length < items.length) {
        toast(`Some node types can no longer be ${verb}.`);
      }
      if (creatable.length === 0) return;

      const minX = Math.min(...creatable.map((item) => item.node.position.x));
      const minY = Math.min(...creatable.map((item) => item.node.position.y));

      const createdIds: string[] = [];
      for (const item of creatable) {
        const { nodeId } = await createNode({
          node: item.node,
          position: {
            x: anchor.x + (item.node.position.x - minX),
            y: anchor.y + (item.node.position.y - minY),
          },
          initialValues: item.values,
          selectNewNode: false,
        });
        createdIds.push(nodeId);
      }

      // Sélection finale en un bloc : les nouveaux sélectionnés, les anciens
      // désélectionnés, sans toucher au viewport. Le registre pending
      // (`useCreateNode` marque chaque id) protège cette sélection des syncs
      // Convex intermédiaires (listes serveur partiels).
      const createdIdSet = new Set(createdIds);
      setNodes((nodes) =>
        nodes.map((node) => {
          const shouldSelect = createdIdSet.has(node.id);
          if (!!node.selected === shouldSelect) return node;
          return { ...node, selected: shouldSelect };
        }),
      );
    },
    [createNode, setNodes],
  );

  return { createNodesFromItems };
}
