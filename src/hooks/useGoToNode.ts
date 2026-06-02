import { useCallback } from "react";
import { useReactFlow } from "@xyflow/react";

type GoToNodeOptions = {
  duration?: number;
  minZoom?: number;
  maxZoom?: number;
};

/**
 * Navigate to a node on the canvas AND select it.
 *
 * Centers the viewport on the node (via fitView) and selects only that node,
 * deselecting the rest. Use this everywhere a "go to node" action exists so the
 * targeted node always becomes the active selection.
 */
export function useGoToNode() {
  const { fitView, setNodes } = useReactFlow();

  return useCallback(
    (nodeId: string, options?: GoToNodeOptions) => {
      // Select only this node (deselect the rest) — same pattern as useCreateNode
      setNodes((nodes) =>
        nodes.map((n) => ({ ...n, selected: n.id === nodeId })),
      );
      fitView({
        nodes: [{ id: nodeId }],
        duration: options?.duration ?? 500,
        minZoom: options?.minZoom ?? 0.5,
        maxZoom: options?.maxZoom ?? 1,
      });
    },
    [fitView, setNodes],
  );
}
