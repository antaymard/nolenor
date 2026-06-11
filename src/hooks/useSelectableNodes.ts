import { useMemo } from "react";
import { useReactFlow, useStore } from "@xyflow/react";
import type { CanvasNode } from "@/types";

/**
 * Canvas nodes currently selected on the canvas that aren't already attached to
 * the chat — i.e. the nodes the user could attach to their next message.
 *
 * Subscribes only to the *set of selected node ids* (as a joined string) so
 * referential equality skips re-renders on pan/zoom/drag/position updates.
 */
export function useSelectableNodes(
  attachedNodes: readonly CanvasNode[],
): CanvasNode[] {
  const reactFlow = useReactFlow();
  const selectedNodeIdsKey = useStore((s) =>
    s.nodes
      .filter((n) => n.selected)
      .map((n) => n.id)
      .join(","),
  );

  return useMemo(() => {
    const attachedIds = new Set(attachedNodes.map((node) => node.id));
    const selected = reactFlow
      .getNodes()
      .filter((n) => n.selected) as unknown as CanvasNode[];
    return selected.filter((node) => !attachedIds.has(node.id));
    // selectedNodeIdsKey is the dependency that drives reactivity here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNodeIdsKey, attachedNodes, reactFlow]);
}
