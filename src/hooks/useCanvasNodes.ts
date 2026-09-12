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
} from "@/lib/node-types-converter";
import {
  applyNodePatchesToListQuery,
  removeNodesFromListQuery,
} from "@/lib/flowNodes";
import type { CanvasNode } from "@/types";
import { useWindowsStore } from "@/stores/windowsStore";
import { pendingAutoSizeIds } from "@/components/nodes/prebuilt-nodes/useTitleNodeSizing";
import { toastError } from "@/components/utils/errorUtils";
import { trackCanvasSync } from "@/lib/trackCanvasSync";
import {
  clearPendingCreations,
  consumePendingCreation,
  isNodePendingCreation,
} from "@/lib/pendingCreatedNodes";
import { recordUndo } from "@/stores/canvasHistoryStore";

/**
 * Écriture serveur d'un changement de nœud.
 *
 * Ces mutations partaient jusqu'ici sans aucun `catch` : un ajout, une
 * suppression ou un déplacement refusé par le serveur échouait en silence —
 * l'utilisateur voyait seulement son nœud revenir à sa place, sans savoir
 * pourquoi. On centralise ici le suivi du statut de synchro (`CanvasStatus`)
 * et le retour visuel.
 */
function persistNodeChange(
  operation: () => Promise<unknown>,
  failureMessage: string,
): Promise<void> {
  return trackCanvasSync(operation)
    .then(() => undefined)
    .catch((error: unknown) => {
      toastError(error, failureMessage);
    });
}

const DEBUG_TITLE_SIZING = false;

function logTitleSizing(event: string, payload?: unknown) {
  if (!DEBUG_TITLE_SIZING) return;
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
  const reassignViewportWindowOwner = useWindowsStore(
    (state) => state.reassignViewportWindowOwner,
  );

  const lastPositionChangesWhenResizing = useRef<NodePositionChange[] | null>(
    null,
  );

  // Positions de drag buffered jusqu'au relâcher — aucune écriture serveur
  // pendant le geste (cf. `bufferDragPositions`).
  const dragPendingRef = useRef<Map<string, { x: number; y: number }>>(
    new Map(),
  );

  // Position de chaque node AVANT le geste en cours, pour l'annulation.
  // Capturée à la première frame où il bouge, depuis `getNodes()` lu avant que
  // `onNodesChange` n'applique le changement — après, l'état local porte déjà
  // la nouvelle position et l'ancienne est perdue. Vidée au flush, en même
  // temps que le buffer qu'elle accompagne.
  const dragOriginsRef = useRef<Map<string, { x: number; y: number }>>(
    new Map(),
  );

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
  const patchNodesInConvex = useMutation(api.nodes.patch).withOptimisticUpdate(
    (localStore, { updates }) => {
      applyNodePatchesToListQuery(localStore, canvasId, updates);
    },
  );
  const trashNodesInConvex = useMutation(api.nodes.trash).withOptimisticUpdate(
    (localStore, { nodeIds }) => {
      removeNodesFromListQuery(localStore, canvasId, nodeIds);
    },
  );

  const persistLayoutUpdates = useCallback(
    (
      updates: Array<{
        nodeId: string;
        props: {
          position?: { x: number; y: number };
          width?: number;
          height?: number;
        };
      }>,
      {
        touchCanvas,
        failureMessage,
        track,
      }: { touchCanvas: boolean; failureMessage?: string; track: boolean },
    ) => {
      if (updates.length === 0) return Promise.resolve();
      const run = () => patchNodesInConvex({ updates, touchCanvas });
      if (track && failureMessage) {
        return persistNodeChange(run, failureMessage);
      }
      return run().catch(() => undefined);
    },
    [patchNodesInConvex],
  );

  // Vide le buffer de positions en une seule mutation : relâcher d'un drag
  // (change `dragging: false`) ou changement de position hors drag.
  const flushDragPositions = useCallback(
    (opts: {
      touchCanvas: boolean;
      track: boolean;
      failureMessage?: string;
    }) => {
      const pending = dragPendingRef.current;
      if (pending.size === 0) {
        dragOriginsRef.current.clear();
        return;
      }
      const updates = [...pending.entries()].map(([nodeId, position]) => ({
        nodeId,
        props: { position },
      }));

      // Un déplacement de N nodes sélectionnés est UN geste : une seule entrée
      // d'historique, avec les N positions d'origine.
      const origins = dragOriginsRef.current;
      const undoUpdates = updates.flatMap((update) => {
        const origin = origins.get(update.nodeId);
        return origin ? [{ nodeId: update.nodeId, props: { position: origin } }] : [];
      });
      if (undoUpdates.length > 0) {
        recordUndo(
          { kind: "patchNodes", updates: undoUpdates },
          { kind: "patchNodes", updates },
        );
      }

      pending.clear();
      origins.clear();
      return persistLayoutUpdates(updates, opts);
    },
    [persistLayoutUpdates],
  );

  // Buffer pur, sans flush pendant le geste. Chaque écriture serveur en
  // plein drag invalidait `nodes.listFromCanvas`, dont la re-synchro
  // re-rendait tous les nodes à ~2,5 Hz — le framerate du drag s'effondrait
  // sur un canvas chargé. Contrepartie assumée : les autres utilisateurs
  // voient le node sauter à sa destination au relâcher, pas le suivre en
  // direct.
  const bufferDragPositions = useCallback(
    (
      positions: Array<{ id: string; position?: { x: number; y: number } }>,
    ) => {
      for (const item of positions) {
        if (item.position) dragPendingRef.current.set(item.id, item.position);
      }
    },
    [],
  );

  // Aucun pending ne doit fuiter d'un canvas à l'autre.
  useEffect(() => {
    clearPendingCreations();
    dragPendingRef.current.clear();
    dragOriginsRef.current.clear();
  }, [canvasId]);

  // Sync Convex -> React Flow nodes while preserving drag/resize state
  // and selection.
  useEffect(() => {
    if (canvasNodes !== undefined) {
      // Snapshot hors updater (pur) : l'updater `setNodes` doit rester sans
      // effet de bord (double-invoke en StrictMode). La consommation du
      // pending se fait après, une fois la sélection appliquée.
      const pendingSelectedIds = new Set(
        canvasNodes
          .filter((n) => isNodePendingCreation(n.id))
          .map((n) => n.id),
      );

      setNodes((currentNodes: Node[]) => {
        const newNodes = fromCanvasNodesToXyNodes(canvasNodes);
        const currentNodesMap = new Map(currentNodes.map((n) => [n.id, n]));
        const serverIds = new Set(newNodes.map((n) => n.id));

        const mapped = newNodes.map((newNode) => {
          const currentNode = currentNodesMap.get(newNode.id);
          // Première apparition serveur d'un node créé localement : on force
          // la sélection (paste/duplicate multi-nodes). Sans ça, un
          // `readCanvas` partiel (N mutations en vol) faisait réapparaître
          // les nodes avec `selected: false`.
          const freshlyConfirmed = pendingSelectedIds.has(newNode.id);

          // If the node is currently being dragged or resized, keep the full
          // current node object.
          // Also preserve descendants being moved along with a dragged parent
          if (
            currentNode?.dragging ||
            (currentNode as Node)?.resizing ||
            (draggedChildrenCache.current.draggedNodeId !== null &&
              draggedChildrenCache.current.descendantIds.includes(newNode.id))
          ) {
            if (freshlyConfirmed && currentNode) {
              return { ...currentNode, selected: true } as Node;
            }
            if (currentNode) return currentNode as Node;
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
              ...((currentNode.selected || freshlyConfirmed) && {
                selected: true,
              }),
            } as Node;
          }

          // Otherwise use the fresh node from Convex, but preserve selection.
          if (currentNode?.selected || freshlyConfirmed) {
            return { ...newNode, selected: true } as Node;
          }

          return newNode as Node;
        });

        // Garde les nodes créés localement tant que le serveur ne les a pas
        // renvoyés : sans ça, un `readCanvas` intermédiaire (ex. node1 persisté,
        // node2/3 pas encore) supprimait les nodes en attente, qui revenaient
        // ensuite désélectionnés. Seuls les ids pending sont gardés — une
        // suppression (locale ou distante) reste appliquée normalement.
        for (const currentNode of currentNodes) {
          if (
            !serverIds.has(currentNode.id) &&
            isNodePendingCreation(currentNode.id)
          ) {
            mapped.push(currentNode);
          }
        }

        return mapped;
      });

      for (const id of pendingSelectedIds) consumePendingCreation(id);
    }
  }, [canvasNodes, setNodes]);

  const handleNodeChange = useCallback(
    (changes: NodeChange[]) => {
      const positionChanges = changes.filter(
        (change: NodeChange) => change.type === "position",
      ) as NodePositionChange[];

      // AVANT `onNodesChange` : c'est le dernier instant où l'état local porte
      // encore la position d'origine. « Si absent » : un drag rejoue ce
      // handler à chaque frame, seule la première compte.
      if (positionChanges.length > 0) {
        const origins = dragOriginsRef.current;
        const missing = positionChanges.filter(
          (change) => change.position && !origins.has(change.id),
        );
        if (missing.length > 0) {
          const currentById = new Map(
            getNodes().map((node) => [node.id, node.position]),
          );
          for (const change of missing) {
            const position = currentById.get(change.id);
            if (position) origins.set(change.id, { ...position });
          }
        }
      }

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
                  // Les descendants entraînés n'émettent pas de change React
                  // Flow : leur position d'origine ne serait capturée nulle
                  // part, et l'annulation du drag les laisserait sur place
                  // pendant que le parent reviendrait. Ici, `currentNodes` est
                  // encore l'état d'avant le geste.
                  if (!dragOriginsRef.current.has(descId)) {
                    dragOriginsRef.current.set(descId, {
                      ...descNode.position,
                    });
                  }
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
        // Persistée en amont par `nodes.createWithNodeData` (useCreateNode).
        return;
      } else if (removedChanges.length > 0) {
        // REMOVE NODES
        const removedIds = removedChanges.map((change) => change.id);
        // Un node pending supprimé avant confirmation serveur ne reviendra
        // jamais : on purge son pending pour ne pas le garder en local.
        for (const id of removedIds) consumePendingCreation(id);
        // La window `viewport` est un singleton : si un marker supprimé la
        // possédait, on la transmet à un marker survivant au lieu de la
        // fermer. Les ids supprimés sont exclus explicitement — l'état React
        // Flow peut ne pas encore refléter la suppression à ce stade.
        const removedIdSet = new Set(removedIds);
        const survivingViewport = getNodes().find(
          (node) => node.type === "viewport" && !removedIdSet.has(node.id),
        );
        const survivingNodeDataId = (
          survivingViewport?.data as
            | { nodeDataId?: Id<"nodeDatas"> }
            | undefined
        )?.nodeDataId;
        reassignViewportWindowOwner(
          removedIds,
          survivingViewport && survivingNodeDataId
            ? {
                xyNodeId: survivingViewport.id,
                nodeDataId: survivingNodeDataId,
              }
            : null,
        );
        closeWindowsForNodeIds(removedIds);
        // Directly persist remove operations to Convex.
        return persistNodeChange(
          () =>
            trashNodesInConvex({
              nodeIds: removedChanges.map((c) => c.id),
            }),
          "Could not delete the node",
        );
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
            dragOriginsRef.current.clear();
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

          const resizeUpdates = mergedChanges.map((change) => ({
            nodeId: change.id,
            props: {
              ...(change.position && { position: change.position }),
              ...(change.dimensions && {
                width: change.dimensions.width,
                height: change.dimensions.height,
              }),
            },
          }));

          // Le redimensionnement et le déplacement qu'il entraîne (poignée
          // haut/gauche) sont déjà fusionnés dans `mergedChanges` : une seule
          // entrée, donc un seul Ctrl+Z pour un seul coup de souris. L'état
          // d'avant est `canvasNodes`, le dernier persisté.
          const undoResize = resizeUpdates.flatMap((update) => {
            const before = canvasNodes?.find((n) => n.id === update.nodeId);
            if (!before) return [];
            return [
              {
                nodeId: update.nodeId,
                props: {
                  ...(update.props.position && { position: before.position }),
                  ...(update.props.width !== undefined && {
                    width: before.width,
                    height: before.height,
                  }),
                },
              },
            ];
          });
          if (undoResize.length > 0) {
            recordUndo(
              { kind: "patchNodes", updates: undoResize },
              { kind: "patchNodes", updates: resizeUpdates },
            );
          }

          void persistLayoutUpdates(
            resizeUpdates,
            {
              touchCanvas: true,
              track: true,
              failureMessage: "Could not save the node size",
            },
          );
          const titleMergedChanges = mergedChanges.filter((change) =>
            canvasNodes?.some((n) => n.id === change.id && n.type === "title"),
          );
          if (titleMergedChanges.length > 0) {
            logTitleSizing("persist-dimension-mutation", {
              changes: titleMergedChanges,
            });
          }
          lastPositionChangesWhenResizing.current = null;
          // Un redimensionnement avale les changements de position qu'il
          // entraîne : les origines capturées pour eux ne doivent pas survivre
          // au geste, sinon le drag suivant du même node ramènerait sa
          // position d'avant le redimensionnement.
          dragOriginsRef.current.clear();
        }
      } else if (positionChanges.length > 0) {
        const { descendantIds, descendantSet } = draggedChildrenCache.current;
        const descendantChanges: NodePositionChange[] = [];
        if (descendantIds.length > 0) {
          const currentNodes = getNodes();
          const positionChangeIds = new Set(positionChanges.map((c) => c.id));
          for (const node of currentNodes) {
            if (
              descendantSet.has(node.id) &&
              !positionChangeIds.has(node.id)
            ) {
              descendantChanges.push({
                type: "position",
                id: node.id,
                position: node.position,
                dragging: isDragging,
              });
            }
          }
        }

        const allPositionChanges = [...positionChanges, ...descendantChanges];

        if (isDragging && dimensionChanges.length === 0) {
          // En plein drag : buffer seulement, la persistance part au
          // relâcher dans la branche else du change `dragging: false`.
          bufferDragPositions(allPositionChanges);
        } else {
          for (const change of allPositionChanges) {
            if (change.position) {
              dragPendingRef.current.set(change.id, change.position);
            }
          }
          draggedChildrenCache.current = {
            draggedNodeId: null,
            descendantIds: [],
            descendantSet: new Set(),
            initialOffsets: new Map(),
          };
          return flushDragPositions({
            touchCanvas: true,
            track: true,
            failureMessage: "Could not save the node position",
          });
        }
      }
    },
    [
      canvasNodes,
      closeWindowsForNodeIds,
      reassignViewportWindowOwner,
      trashNodesInConvex,
      persistLayoutUpdates,
      bufferDragPositions,
      flushDragPositions,
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
