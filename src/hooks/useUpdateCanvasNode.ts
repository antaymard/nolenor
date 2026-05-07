import { useCallback, useRef } from "react";
import { useReactFlow, type Node } from "@xyflow/react";
import { useParams } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import type { colorsEnum } from "@/types/domain";
import type { CanvasNode } from "@/types";
import { toastError } from "@/components/utils/errorUtils";

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

  // Mirror the server logic in canvasNodeModels.updateCanvasNodes on the
  // convex local query so the canvases.readCanvas → setNodes sync in
  // useCanvasNodes does not briefly bounce data fields back to their
  // pre-mutation value (e.g. titleSizing snapping back to "auto" right
  // after a manual resize).
  const updateCanvasNodesMutation = useMutation(
    api.canvasNodes.updateCanvasNodes,
  ).withOptimisticUpdate((localStore, { canvasId: targetCanvasId, nodeProps }) => {
    const existing = localStore.getQuery(api.canvases.readCanvas, {
      canvasId: targetCanvasId,
    });
    if (!existing || !existing.nodes) return;
    const propsById = new Map<
      string,
      {
        props?: ConvexNodeProps;
        data?: Record<string, unknown>;
      }
    >();
    for (const item of nodeProps as Array<{
      id: string;
      props?: ConvexNodeProps;
      data?: Record<string, unknown>;
    }>) {
      propsById.set(item.id, item);
    }
    if (propsById.size === 0) return;
    localStore.setQuery(
      api.canvases.readCanvas,
      { canvasId: targetCanvasId },
      {
        ...existing,
        nodes: existing.nodes.map((node: CanvasNode) => {
          const update = propsById.get(node.id);
          if (!update) return node;
          const next: CanvasNode = { ...node };
          if (update.props) {
            if (update.props.locked !== undefined)
              next.locked = update.props.locked;
            if (update.props.hidden !== undefined)
              next.hidden = update.props.hidden;
            if (update.props.zIndex !== undefined)
              next.zIndex = update.props.zIndex;
            if (update.props.color !== undefined)
              next.color = update.props.color;
            if (update.props.variant !== undefined)
              next.variant = update.props.variant;
          }
          if (update.data !== undefined) {
            next.data = { ...(node.data ?? {}), ...update.data };
          }
          return next;
        }),
      },
    );
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
      const nodeProps = inputs.map(({ nodeId, props, data }) => ({
        id: nodeId,
        ...(props && { props }),
        ...(data && { data }),
      }));

      await updateCanvasNodesMutation({
        canvasId,
        nodeProps,
      });
    },
    [canvasId, updateCanvasNodesMutation],
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
