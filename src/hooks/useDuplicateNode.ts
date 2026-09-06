import { useCallback } from "react";
import type { Node } from "@xyflow/react";
import toast from "react-hot-toast";
import type { Id } from "@/../convex/_generated/dataModel";
import { useCreateNode } from "@/hooks/useCreateNode";
import { useNodeDataStore } from "@/stores/nodeDataStore";
import { canNodeTypeBeCreated } from "@/components/nodes/prebuilt-nodes/prebuiltNodesConfig";
import { nodeDataConfig } from "@/../convex/config/nodeConfig";

/**
 * Les values du node, moins celles que son type déclare non duplicables.
 *
 * Dupliquer copie `values` en bloc mais ne copie AUCUN edge : une value qui ne
 * tient son sens que des connexions du node d'origine arriverait inerte sur le
 * doublon, et se rallumerait de façon surprenante s'il venait à être rebranché
 * sur les mêmes sources. Quelles clés sont dans ce cas est une propriété du
 * type de node, déclarée dans `nodeConfig.ts` (`valuesNotDuplicated`) — pas une
 * liste de cas particuliers cachée dans ce helper générique.
 */
function valuesToDuplicate(
  nodeType: string | undefined,
  values: Record<string, unknown>,
): Record<string, unknown> {
  const excluded = nodeDataConfig.find((config) => config.type === nodeType)
    ?.valuesNotDuplicated;
  if (!excluded || excluded.length === 0) return values;

  const copy = { ...values };
  for (const key of excluded) delete copy[key];
  return copy;
}

export function useDuplicateNode() {
  const { createNode } = useCreateNode();
  const getNodeData = useNodeDataStore((state) => state.getNodeData);

  const duplicateNode = useCallback(
    async (nodeToDuplicate: Node) => {
      if (!canNodeTypeBeCreated(nodeToDuplicate.type)) {
        toast("This node type can no longer be duplicated.");
        return;
      }

      let initialValues: Record<string, unknown> | undefined;
      const nodeDataId = nodeToDuplicate.data?.nodeDataId as
        | Id<"nodeDatas">
        | undefined;

      if (nodeDataId) {
        const nodeData = getNodeData(nodeDataId);
        if (nodeData) {
          initialValues = valuesToDuplicate(nodeData.type, nodeData.values);
        }
      }

      return createNode({
        node: nodeToDuplicate,
        position: {
          x: nodeToDuplicate.position.x + 50,
          y: nodeToDuplicate.position.y + 50,
        },
        initialValues,
      });
    },
    [createNode, getNodeData],
  );

  return { duplicateNode };
}
