import { useCallback, useRef } from "react";
import { useReactFlow, type Node } from "@xyflow/react";
import { useParams } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import type { colorsEnum } from "@/types/domain";
import { toastError } from "@/components/utils/errorUtils";
import { trackCanvasSync } from "@/lib/trackCanvasSync";
import { applyNodePatchesToListQuery } from "@/lib/flowNodes";

interface ConvexNodeProps {
  locked?: boolean;
  hidden?: boolean;
  zIndex?: number;
  color?: colorsEnum;
  variant?: string;
}

interface UpdateNodeInput {
  nodeId: string;
  props?: ConvexNodeProps;
  data?: Record<string, unknown>;
}

interface UseUpdateCanvasNodeReturn {
  updateCanvasNode: (input: UpdateNodeInput) => Promise<void>;
  updateCanvasNodes: (inputs: UpdateNodeInput[]) => Promise<void>;
  isUpdating: boolean;
}

export function useUpdateCanvasNode(): UseUpdateCanvasNodeReturn {
  const { canvasId }: { canvasId: Id<"canvases"> } = useParams({
    from: "/canvas/$canvasId",
  });

  const { getNode, setNodes } = useReactFlow();

  // Optimistic listFromCanvas so the Convex → React Flow sync does not bounce
  // patched fields (color, lock, titleSizing, …) back to their pre-mutation
  // value.
  const updateCanvasNodesMutation = useMutation(
    api.nodes.patch,
  ).withOptimisticUpdate((localStore, { updates }) => {
    applyNodePatchesToListQuery(localStore, canvasId, updates);
  });

  const snapshotsRef = useRef<Map<string, Node>>(new Map());
  const isUpdatingRef = useRef(false);

  const saveSnapshot = useCallback(
    (nodeId: string): boolean => {
      const node = getNode(nodeId);
      if (!node) {
        console.warn(`[useUpdateCanvasNode] Node ${nodeId} not found`);
        return false;
      }
      snapshotsRef.current.set(nodeId, structuredClone(node));
      return true;
    },
    [getNode],
  );

  const revertNodes = useCallback(
    (nodeIds: string[]) => {
      setNodes((currentNodes) => {
        const result = currentNodes.map((node) => {
          if (!nodeIds.includes(node.id)) return node;
          const snapshot = snapshotsRef.current.get(node.id);
          return snapshot ?? node;
        });
        // Supprimer les snapshots après les avoir utilisés, à l'intérieur du callback
        nodeIds.forEach((id) => snapshotsRef.current.delete(id));
        return result;
      });
    },
    [setNodes],
  );

  const applyLocalUpdates = useCallback(
    (inputs: UpdateNodeInput[]) => {
      const inputsMap = new Map(inputs.map((i) => [i.nodeId, i]));

      setNodes((currentNodes) =>
        currentNodes.map((node) => {
          const input = inputsMap.get(node.id);
          if (!input) return node;

          const { props, data } = input;

          // Props structurelles
          const structuralUpdates: Partial<Node> = {};
          if (props) {
            if (props.locked !== undefined)
              structuralUpdates.draggable = !props.locked;
            if (props.hidden !== undefined)
              structuralUpdates.hidden = props.hidden;
            if (props.zIndex !== undefined)
              structuralUpdates.zIndex = props.zIndex;
          }

          // Data (color, variant + custom data)
          const dataUpdate: Record<string, unknown> = {};
          if (props?.color !== undefined) dataUpdate.color = props.color;
          if (props?.variant !== undefined) dataUpdate.variant = props.variant;
          if (data) Object.assign(dataUpdate, data);

          const hasDataUpdate = Object.keys(dataUpdate).length > 0;
          const hasStructuralUpdate = Object.keys(structuralUpdates).length > 0;

          if (!hasDataUpdate && !hasStructuralUpdate) return node;

          return {
            ...node,
            ...structuralUpdates,
            ...(hasDataUpdate && { data: { ...node.data, ...dataUpdate } }),
          };
        }),
      );
    },
    [setNodes],
  );

  const executeServerUpdate = useCallback(
    async (inputs: UpdateNodeInput[]): Promise<void> => {
      await trackCanvasSync(() =>
        updateCanvasNodesMutation({
          updates: inputs.map(({ nodeId, props, data }) => ({
            nodeId,
            props: {
              ...(props ?? {}),
              ...(data && { data }),
            },
          })),
        }),
      );
    },
    [updateCanvasNodesMutation],
  );

  const updateNodes = useCallback(
    async (inputs: UpdateNodeInput[]): Promise<void> => {
      if (inputs.length === 0) return;

      const validInputs = inputs.filter((input) => saveSnapshot(input.nodeId));
      if (validInputs.length === 0) return;

      isUpdatingRef.current = true;
      applyLocalUpdates(validInputs);

      try {
        await executeServerUpdate(validInputs);
        validInputs.forEach((input) =>
          snapshotsRef.current.delete(input.nodeId),
        );
      } catch (error) {
        revertNodes(validInputs.map((i) => i.nodeId));
        toastError(error, "Error updating");
      } finally {
        isUpdatingRef.current = false;
      }
    },
    [saveSnapshot, applyLocalUpdates, executeServerUpdate, revertNodes],
  );

  const updateNode = useCallback(
    async (input: UpdateNodeInput): Promise<void> => {
      return updateNodes([input]);
    },
    [updateNodes],
  );

  return {
    updateCanvasNode: updateNode,
    updateCanvasNodes: updateNodes,
    isUpdating: isUpdatingRef.current,
  };
}
