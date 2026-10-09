import { useCallback } from "react";
import { useReactFlow, type Node } from "@xyflow/react";
import type { Id } from "@/../convex/_generated/dataModel";
import { useFrameWindowFocusStore } from "@/stores/frameWindowFocusStore";
import { useWindowsStore } from "@/stores/windowsStore";

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
 *
 * Un node caché par une frame compacte n'a rien à montrer sur le canvas —
 * `fitView` ignore les nodes masqués, la vue partait n'importe où. On cadre
 * alors la carte de la frame et on ouvre sa window, qui cadre sur le node
 * (cf. `frameWindowFocusStore`). Le node est sélectionné quand même : la
 * sélection du canvas est celle de la window, il y apparaît sélectionné.
 */
export function useGoToNode() {
  const { fitView, getNode, setNodes } = useReactFlow();
  const openWindow = useWindowsStore((state) => state.openWindow);

  return useCallback(
    (nodeId: string, options?: GoToNodeOptions) => {
      const fitOptions = {
        duration: options?.duration ?? 500,
        minZoom: options?.minZoom ?? 0.5,
        maxZoom: options?.maxZoom ?? 1,
      };
      const frame = compactFrameHiding(getNode(nodeId), getNode);
      const frameNodeDataId = frame?.data?.nodeDataId as
        | Id<"nodeDatas">
        | undefined;
      const openedInFrame =
        frame !== null &&
        frameNodeDataId !== undefined &&
        openWindow({
          xyNodeId: frame.id,
          nodeDataId: frameNodeDataId,
          nodeType: "frame",
        });

      // Select only this node (deselect the rest) — same pattern as
      // useCreateNode. Sans window où le montrer, c'est la frame qu'on
      // sélectionne : un node sélectionné mais invisible partirait au
      // premier Suppr sans qu'on l'ait vu.
      const selectedId = frame && !openedInFrame ? frame.id : nodeId;
      setNodes((nodes) =>
        nodes.map((n) => ({ ...n, selected: n.id === selectedId })),
      );

      if (frame) {
        if (openedInFrame) {
          useFrameWindowFocusStore
            .getState()
            .requestFocus({ frameId: frame.id, nodeId });
        }
        fitView({ nodes: [{ id: frame.id }], ...fitOptions });
        return;
      }

      fitView({ nodes: [{ id: nodeId }], ...fitOptions });
    },
    [fitView, getNode, openWindow, setNodes],
  );
}

/** La frame compacte qui masque ce node, ou `null`. */
function compactFrameHiding(
  node: Node | undefined,
  getNode: (id: string) => Node | undefined,
): Node | null {
  if (!node?.parentId || node.data?.hiddenByFrame !== true) return null;
  return getNode(node.parentId) ?? null;
}
