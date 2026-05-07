import { useCallback, useEffect, useRef } from "react";
import {
  useNodesState,
  useReactFlow,
  type Node,
  type NodeAddChange,
  type NodeChange,
  type NodeDimensionChange,
  type NodePositionChange,
  type NodeRemoveChange,
} from "@xyflow/react";
import { useMutation } from "convex/react";
import { useKeyHold } from "@tanstack/react-hotkeys";
import type { Id } from "@/../convex/_generated/dataModel";
import { api } from "@/../convex/_generated/api";
import {
  fromCanvasNodesToXyNodes,
  fromXyNodesToCanvasNodes,
} from "@/lib/node-types-converter";
import type { CanvasNode } from "@/types";
import { useWindowsStore } from "@/stores/windowsStore";
import { pendingAutoSizeIds } from "@/components/nodes/prebuilt-nodes/useTitleNodeSizing";

function logTitleSizing(event: string, payload?: unknown) {
  if (payload !== undefined) {
    console.log(`[CanvasNodes][TitleSizing] ${event}`, payload);
    return;
  }
  console.log(`[CanvasNodes][TitleSizing] ${event}`);
}

/**
 * Build a map of source -> target node IDs from edges (children = targets of a source).
 */
function buildChildrenMap(
  edges: { source: string; target: string }[],
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const edge of edges) {
    const children = map.get(edge.source);
    if (children) {
      children.push(edge.target);
    } else {
      map.set(edge.source, [edge.target]);
    }
  }
  return map;
}

/**
 * Collect all descendants of a node recursively, avoiding cycles.
 */
function collectDescendants(
  nodeId: string,
  childrenMap: Map<string, string[]>,
  visited: Set<string> = new Set(),
): string[] {
  const result: string[] = [];
  const children = childrenMap.get(nodeId);
  if (!children) return result;

  for (const childId of children) {
    if (visited.has(childId)) continue;
    visited.add(childId);
    result.push(childId);
    result.push(...collectDescendants(childId, childrenMap, visited));
  }
  return result;
}

export function useCanvasNodes(
  canvasId: Id<"canvases">,
  canvasNodes?: CanvasNode[],
) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const { getEdges, getNodes } = useReactFlow();
  const isCtrlHeld = useKeyHold("Control");
  const closeWindowsForNodeIds = useWindowsStore(
    (state) => state.closeWindowsForNodeIds,
  );

  const lastPositionChangesWhenResizing = useRef<NodePositionChange[] | null>(
    null,
  );

  // Cache: dragged node ID -> descendants + their initial offsets from parent
  const draggedChildrenCache = useRef<{
    draggedNodeId: string | null;
    descendantIds: string[];
    descendantSet: Set<string>;
    // offset = descendant.initialPosition - parent.initialPosition
    initialOffsets: Map<string, { x: number; y: number }>;
  }>({
    draggedNodeId: null,
    descendantIds: [],
    descendantSet: new Set(),
    initialOffsets: new Map(),
  });

  // CONVEX MUTATIONS
  const addCanvasNodesToConvex = useMutation(api.canvasNodes.add);
  // Optimistic updates mirror the mutation on the local canvas query so the
  // sync effect above does not briefly re-read stale server data and bounce
  // nodes back to their pre-mutation state.
  const updateCanvasNodesPositionOrDimensionsInConvex = useMutation(
    api.canvasNodes.updatePositionOrDimensions,
  ).withOptimisticUpdate(
    (localStore, { canvasId: targetCanvasId, nodeChanges }) => {
      const existing = localStore.getQuery(api.canvases.readCanvas, {
        canvasId: targetCanvasId,
      });
      if (!existing || !existing.nodes) return;
      const changeById = new Map<
        string,
        {
          position?: { x: number; y: number };
          dimensions?: { width: number; height: number };
        }
      >();
      for (const change of nodeChanges as Array<{
        id: string;
        position?: { x: number; y: number };
        dimensions?: { width: number; height: number };
      }>) {
        changeById.set(change.id, change);
      }
      const nextNodes = existing.nodes.map((node: CanvasNode) => {
        const change = changeById.get(node.id);
        if (!change) return node;
        const next = { ...node };
        if (change.position) next.position = change.position;
        if (change.dimensions) {
          next.width = change.dimensions.width;
          next.height = change.dimensions.height;
        }
        return next;
      });
      localStore.setQuery(
        api.canvases.readCanvas,
        { canvasId: targetCanvasId },
        { ...existing, nodes: nextNodes },
      );
    },
  );
  const removeCanvasNodesToConvex = useMutation(
    api.canvasNodes.remove,
  ).withOptimisticUpdate(
    (localStore, { canvasId: targetCanvasId, nodeCanvasIds }) => {
      const existing = localStore.getQuery(api.canvases.readCanvas, {
        canvasId: targetCanvasId,
      });
      if (!existing || !existing.nodes) return;
      const removedIds = new Set(nodeCanvasIds);
      localStore.setQuery(
        api.canvases.readCanvas,
        { canvasId: targetCanvasId },
        {
          ...existing,
          nodes: existing.nodes.filter(
            (node: CanvasNode) => !removedIds.has(node.id),
          ),
        },
      );
    },
  );

  // Sync Convex -> React Flow nodes while preserving drag/resize state
  // and selection.
  useEffect(() => {
    if (canvasNodes !== undefined) {
      if (canvasNodes.length === 0) {
        setNodes([]);
        return;
      }

      setNodes((currentNodes: Node[]) => {
        const newNodes = fromCanvasNodesToXyNodes(canvasNodes);
        const currentNodesMap = new Map(currentNodes.map((n) => [n.id, n]));

        return newNodes.map((newNode) => {
          const currentNode = currentNodesMap.get(newNode.id);

          // If the node is currently being dragged or resized, keep the full
          // current node object.
          // Also preserve descendants being moved along with a dragged parent
          if (
            currentNode?.dragging ||
            (currentNode as Node)?.resizing ||
            (draggedChildrenCache.current.draggedNodeId !== null &&
              draggedChildrenCache.current.descendantIds.includes(newNode.id))
          ) {
            return currentNode as Node;
          }

          // Preserve dimensions while useTitleNodeSizing has a pending debounce,
          // so a readCanvas re-fetch (e.g. triggered by a concurrent mutation)
          // doesn't reset the locally-applied size and cause an oscillation loop.
          if (pendingAutoSizeIds.has(newNode.id) && currentNode) {
            return {
              ...newNode,
              width: currentNode.width,
              height: currentNode.height,
              measured: currentNode.measured,
              ...(currentNode.selected && { selected: true }),
            } as Node;
          }

          // Otherwise use the fresh node from Convex, but preserve selection.
          if (currentNode?.selected) {
            return { ...newNode, selected: true } as Node;
          }

          return newNode as Node;
        });
      });
    }
  }, [canvasNodes, setNodes]);

  const handleNodeChange = useCallback(
    (changes: NodeChange[]) => {
      const positionChanges = changes.filter(
        (change: NodeChange) => change.type === "position",
      ) as NodePositionChange[];

      // Move children along with dragged parent (unless Ctrl is held)
      // Compute delta BEFORE onNodesChange applies the parent's new position
      const isDragging = positionChanges.some((change) => change.dragging);
      let parentNewPosition: { x: number; y: number } | null = null;
      let descendantIds: string[] = [];

      if (isDragging && isCtrlHeld) {
        const draggedChanges = positionChanges.filter(
          (c) => c.dragging && c.position,
        );

        if (draggedChanges.length > 0) {
          const draggedIds = new Set(draggedChanges.map((c) => c.id));

          // Rebuild children cache if the dragged node changed
          const cacheKey = [...draggedIds].sort().join(",");
          if (draggedChildrenCache.current.draggedNodeId !== cacheKey) {
            const edges = getEdges();
            const currentNodes = getNodes();
            const childrenMap = buildChildrenMap(edges);
            const allDescendants = new Set<string>();
            for (const draggedId of draggedIds) {
              for (const desc of collectDescendants(
                draggedId,
                childrenMap,
                new Set(draggedIds),
              )) {
                allDescendants.add(desc);
              }
            }
            for (const id of draggedIds) {
              allDescendants.delete(id);
            }

            // Store initial offsets: descendant position - parent position at drag start
            const firstDraggedNode = currentNodes.find(
              (n) => n.id === draggedChanges[0].id,
            );
            const initialOffsets = new Map<string, { x: number; y: number }>();
            if (firstDraggedNode) {
              const nodesMap = new Map(currentNodes.map((n) => [n.id, n]));
              for (const descId of allDescendants) {
                const descNode = nodesMap.get(descId);
                if (descNode) {
                  initialOffsets.set(descId, {
                    x: descNode.position.x - firstDraggedNode.position.x,
                    y: descNode.position.y - firstDraggedNode.position.y,
                  });
                }
              }
            }

            draggedChildrenCache.current = {
              draggedNodeId: cacheKey,
              descendantIds: [...allDescendants],
              descendantSet: allDescendants,
              initialOffsets,
            };
          }

          descendantIds = draggedChildrenCache.current.descendantIds;

          if (descendantIds.length > 0) {
            const firstChange = draggedChanges[0];
            if (firstChange.position) {
              parentNewPosition = firstChange.position;
            }
          }
        }
      }

      // Apply parent's position change
      onNodesChange(changes);

      // Set absolute positions for descendants based on initial offsets
      if (parentNewPosition && descendantIds.length > 0) {
        const newPos = parentNewPosition;
        const { descendantSet, initialOffsets } = draggedChildrenCache.current;
        setNodes((currentNodes) =>
          currentNodes.map((node) => {
            if (descendantSet.has(node.id)) {
              const offset = initialOffsets.get(node.id);
              if (offset) {
                return {
                  ...node,
                  position: {
                    x: newPos.x + offset.x,
                    y: newPos.y + offset.y,
                  },
                };
              }
            }
            return node;
          }),
        );
      }

      const addedChanges = changes.filter(
        (change: NodeChange) => change.type === "add",
      ) as NodeAddChange[];
      const dimensionChanges = changes.filter(
        (change: NodeChange) => change.type === "dimensions",
      ) as NodeDimensionChange[];
      const removedChanges = changes.filter(
        (change: NodeChange) => change.type === "remove",
      ) as NodeRemoveChange[];

      // ADD NODES
      if (addedChanges.length > 0) {
        // Directly persist add operations to Convex.
        return addCanvasNodesToConvex({
          canvasNodes: fromXyNodesToCanvasNodes(
            addedChanges.map((c) => c.item) as Node[],
          ),
          canvasId,
        });
      } else if (removedChanges.length > 0) {
        // REMOVE NODES
        closeWindowsForNodeIds(removedChanges.map((change) => change.id));
        // Directly persist remove operations to Convex.
        return removeCanvasNodesToConvex({
          nodeCanvasIds: removedChanges.map((c) => c.id),
          canvasId,
        });
      } else if (dimensionChanges.length > 0) {
        // UPDATE NODE DIMENSIONS
        const titleDimensionChanges = dimensionChanges.filter((change) =>
          canvasNodes?.some(
            (node) => node.id === change.id && node.type === "title",
          ),
        );
        if (titleDimensionChanges.length > 0) {
          logTitleSizing("dimension-changes-received", {
            count: titleDimensionChanges.length,
            changes: titleDimensionChanges.map((change) => ({
              id: change.id,
              resizing: change.resizing,
              dimensions: change.dimensions,
              pendingAutoSize: pendingAutoSizeIds.has(change.id),
              sourceNode: canvasNodes?.find((n) => n.id === change.id),
            })),
          });
        }

        if (
          dimensionChanges.some(
            (change) => (change as NodeDimensionChange).resizing,
          )
        ) {
          if (positionChanges.length > 0) {
            // Keep position changes while resize is in progress.
            lastPositionChangesWhenResizing.current = positionChanges;
          }
        } else {
          // Drop dimension changes that match what's already persisted.
          // ResizeObserver can fire after setNodes() (font load, neighbouring
          // query invalidation re-running this useEffect) and re-emit the
          // exact dimensions we just rendered. Without this guard the
          // resulting mutation invalidates readCanvas / listByCanvasId /
          // listUserCanvases, which re-renders, which re-fires the observer
          // — a self-perpetuating loop on every canvas load. 0.5px absorbs
          // sub-pixel rounding noise.
          const meaningfulChanges = canvasNodes
            ? dimensionChanges.filter((change) => {
                if (pendingAutoSizeIds.has(change.id)) {
                  const sourceNode = canvasNodes.find(
                    (n) => n.id === change.id,
                  );
                  if (sourceNode?.type === "title") {
                    logTitleSizing("filtered-pending-autosize", {
                      id: change.id,
                      dimensions: change.dimensions,
                    });
                  }
                  return false;
                }
                if (!change.dimensions) {
                  const sourceNode = canvasNodes.find(
                    (n) => n.id === change.id,
                  );
                  if (sourceNode?.type === "title") {
                    logTitleSizing("filtered-missing-dimensions", {
                      id: change.id,
                    });
                  }
                  return false;
                }
                const sourceNode = canvasNodes.find((n) => n.id === change.id);
                if (!sourceNode) return true;
                const isMeaningful =
                  Math.abs(change.dimensions.width - sourceNode.width) >= 0.5 ||
                  Math.abs(change.dimensions.height - sourceNode.height) >= 0.5;
                if (sourceNode.type === "title") {
                  logTitleSizing(
                    isMeaningful
                      ? "meaningful-dimension-change"
                      : "filtered-same-dimensions",
                    {
                      id: change.id,
                      incoming: change.dimensions,
                      source: {
                        width: sourceNode.width,
                        height: sourceNode.height,
                      },
                    },
                  );
                }
                return isMeaningful;
              })
            : dimensionChanges;

          if (meaningfulChanges.length === 0) {
            if (titleDimensionChanges.length > 0) {
              logTitleSizing("no-meaningful-dimension-change");
            }
            lastPositionChangesWhenResizing.current = null;
            return;
          }

          // Merge dimension and position changes by node ID.
          const savedPositionChanges =
            lastPositionChangesWhenResizing.current || [];
          const mergedChanges = meaningfulChanges.map((dimChange) => {
            const posChange = savedPositionChanges.find(
              (p) => p.id === dimChange.id,
            );
            return {
              type: "dimensions" as const,
              id: dimChange.id,
              dimensions: dimChange.dimensions,
              position: posChange?.position,
            };
          });

          updateCanvasNodesPositionOrDimensionsInConvex({
            canvasId,
            nodeChanges: mergedChanges,
          });
          const titleMergedChanges = mergedChanges.filter((change) =>
            canvasNodes?.some((n) => n.id === change.id && n.type === "title"),
          );
          if (titleMergedChanges.length > 0) {
            logTitleSizing("persist-dimension-mutation", {
              changes: titleMergedChanges,
            });
          }
          lastPositionChangesWhenResizing.current = null;
        }
      } else if (positionChanges.length > 0) {
        // UPDATE NODE POSITIONS
        if (
          positionChanges.some((change) => change.dragging) &&
          dimensionChanges.length === 0
        ) {
          // No-op while dragging; persist when drag ends.
        } else {
          // Persist to Convex when drag ends.
          // Include descendant position changes when drag ends
          const { descendantIds, descendantSet } = draggedChildrenCache.current;
          if (descendantIds.length > 0) {
            const currentNodes = getNodes();
            const positionChangeIds = new Set(positionChanges.map((c) => c.id));
            const descendantChanges: NodePositionChange[] = currentNodes
              .filter(
                (node) =>
                  descendantSet.has(node.id) && !positionChangeIds.has(node.id),
              )
              .map((node) => ({
                type: "position" as const,
                id: node.id,
                position: node.position,
                dragging: false,
              }));

            draggedChildrenCache.current = {
              draggedNodeId: null,
              descendantIds: [],
              descendantSet: new Set(),
              initialOffsets: new Map(),
            };
            return updateCanvasNodesPositionOrDimensionsInConvex({
              canvasId,
              nodeChanges: [...positionChanges, ...descendantChanges],
            });
          }
          return updateCanvasNodesPositionOrDimensionsInConvex({
            canvasId,
            nodeChanges: positionChanges,
          });
        }
      }
    },
    [
      canvasId,
      canvasNodes,
      addCanvasNodesToConvex,
      closeWindowsForNodeIds,
      removeCanvasNodesToConvex,
      updateCanvasNodesPositionOrDimensionsInConvex,
      onNodesChange,
      getEdges,
      getNodes,
      setNodes,
      isCtrlHeld,
    ],
  );

  return {
    nodes,
    setNodes,
    handleNodeChange,
  };
}
