import { useCallback } from "react";
import type { Node } from "@xyflow/react";
import toast from "react-hot-toast";
import type { Id } from "@/../convex/_generated/dataModel";
import { useCreateNode } from "@/hooks/useCreateNode";
import { useNodeDataStore } from "@/stores/nodeDataStore";
import { canNodeTypeBeCreated } from "@/components/nodes/prebuilt-nodes/prebuiltNodesConfig";

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
          initialValues = nodeData.values;
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
