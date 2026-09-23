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
import { useFrameHoverStore } from "@/stores/frameHoverStore";
import {
  canJoinFrame,
  centerOf,
  findFrameAtPoint,
} from "@/lib/frameMembership";

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

/**
 * Une écriture de mise en page : où le node est, quelle taille il fait, et à
 * quelle frame il appartient. La forme que `nodes.patch` attend pour tout ce
 * que produisent un drag et un redimensionnement.
 */
type LayoutUpdate = {
  nodeId: string;
  props: {
    position?: { x: number; y: number };
    width?: number;
    height?: number;
    /** `null` = sortie de frame. Voyage avec `position` : cf. le flush. */
    parentId?: string | null;
  };
};

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
 * `canVisit` borne le parcours : un node refusé n'est ni collecté ni traversé.
 */
function collectDescendants(
  nodeId: string,
  childrenMap: Map<string, string[]>,
  visited: Set<string> = new Set(),
  canVisit: (id: string) => boolean = () => true,
): string[] {
  const result: string[] = [];
  const children = childrenMap.get(nodeId);
  if (!children) return result;

  for (const childId of children) {
    if (visited.has(childId) || !canVisit(childId)) continue;
    visited.add(childId);
    result.push(childId);
    result.push(
      ...collectDescendants(childId, childrenMap, visited, canVisit),
    );
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

  /**
   * Les changements d'appartenance décidés pendant le drag en cours, à écrire
   * au relâcher en même temps que les positions.
   *
   * Rempli par `onNodeDrag` et pas par `onNodeDragStop` : React Flow appelle
   * `updateNodePositions` AVANT `onNodeDragStop` (cf. le handler `end` de
   * XYDrag), donc `flushDragPositions` part le premier. Le remplir au relâcher
   * arriverait trop tard — et scinder en deux écritures donnerait deux entrées
   * d'historique pour un seul geste, plus un aller-retour visuel entre les
   * deux.
   *
   * `previousParentId` est stocké là parce que `dragOriginsRef` ne porte que
   * la position : sans lui, Ctrl+Z remettrait le node au bon endroit mais dans
   * la mauvaise frame.
   */
  const pendingReparentRef = useRef<
    Map<
      string,
      { parentId: string | null; previousParentId: string | null }
    >
  >(new Map());

  // Un lasso est en cours (entre `onSelectionStart` et `onSelectionEnd`).
  // Un ref plutôt que `userSelectionActive` du store React Flow : l'ordre
  // entre sa mise à jour et les changes `select` émis n'est pas garanti.
  const isLassoActiveRef = useRef(false);

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
      updates: LayoutUpdate[],
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
      // Les frames en jeu, pour convertir les positions d'un repère à
      // l'autre. Les frames sont toujours de premier niveau : leur `position`
      // est donc déjà en coordonnées monde.
      const reparents = pendingReparentRef.current;
      const nodesById =
        reparents.size > 0
          ? new Map(getNodes().map((node) => [node.id, node]))
          : null;

      const updates = [...pending.entries()].map(([nodeId, position]) => {
        const reparent = reparents.get(nodeId);
        if (!reparent || !nodesById) return { nodeId, props: { position } };

        // La position bufferée est exprimée dans le repère d'AVANT le geste :
        // React Flow ne reparente pas en cours de drag, le node garde son
        // ancienne frame (ou aucune) jusqu'au relâcher. On repasse donc par le
        // monde avant d'exprimer la position dans le nouveau repère.
        const from = reparent.previousParentId
          ? nodesById.get(reparent.previousParentId)
          : undefined;
        const to = reparent.parentId
          ? nodesById.get(reparent.parentId)
          : undefined;
        const absolute = from
          ? { x: position.x + from.position.x, y: position.y + from.position.y }
          : position;

        return {
          nodeId,
          props: {
            position: to
              ? { x: absolute.x - to.position.x, y: absolute.y - to.position.y }
              : absolute,
            parentId: reparent.parentId,
          },
        };
      });

      // Un déplacement de N nodes sélectionnés est UN geste : une seule entrée
      // d'historique, avec les N positions d'origine — et, quand le geste a
      // changé l'appartenance, la frame d'origine avec. Les origines ont été
      // capturées avant le geste, donc dans le repère d'avant : elles vont de
      // pair avec `previousParentId`, jamais avec l'un sans l'autre.
      const origins = dragOriginsRef.current;
      const undoUpdates = updates.flatMap((update) => {
        const origin = origins.get(update.nodeId);
        if (!origin) return [];
        const reparent = reparents.get(update.nodeId);
        return [
          {
            nodeId: update.nodeId,
            props: {
              position: origin,
              ...(reparent && { parentId: reparent.previousParentId }),
            },
          },
        ];
      });
      if (undoUpdates.length > 0) {
        recordUndo(
          { kind: "patchNodes", updates: undoUpdates },
          { kind: "patchNodes", updates },
        );
      }

      pending.clear();
      origins.clear();
      reparents.clear();
      return persistLayoutUpdates(updates, opts);
    },
    [getNodes, persistLayoutUpdates],
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
    pendingReparentRef.current.clear();
    useFrameHoverStore.getState().setHoveredFrameId(null);
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
        // Les frames en cours de redimensionnement. Pendant le geste, React
        // Flow corrige la position relative de leurs enfants pour qu'ils ne
        // suivent pas le bord déplacé ; cette correction n'est écrite qu'au
        // relâcher, donc une synchro qui tomberait au milieu la remplacerait
        // par la position d'avant et ferait sauter le contenu.
        const resizingIds = new Set(
          currentNodes.filter((n) => n.resizing).map((n) => n.id),
        );

        const mapped = newNodes.map((newNode) => {
          const currentNode = currentNodesMap.get(newNode.id);
          // Première apparition serveur d'un node créé localement : on force
          // la sélection (paste/duplicate multi-nodes). Sans ça, un
          // `readCanvas` partiel (N mutations en vol) faisait réapparaître
          // les nodes avec `selected: false`.
          const freshlyConfirmed = pendingSelectedIds.has(newNode.id);

          // If the node is currently being dragged or resized, keep the full
          // current node object.
          // Also preserve descendants being moved along with a dragged parent,
          // and the content of a frame being resized.
          const parentId = currentNode?.parentId ?? newNode.parentId;
          if (
            currentNode?.dragging ||
            (currentNode as Node)?.resizing ||
            (parentId !== undefined && resizingIds.has(parentId)) ||
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
    (incomingChanges: NodeChange[]) => {
      // Ctrl + lasso : on ramasse des nodes, jamais les frames — en mode
      // `Partial`, le moindre rectangle tracé dans une frame l'attrapait.
      // Seules les sélections sont touchées : un deselect passe, et un
      // Ctrl+clic sur une frame (qui n'est pas un lasso) la sélectionne
      // toujours.
      //
      // Retournée en `selected: false` plutôt qu'écartée : React Flow a déjà
      // passé `selected` à `true` sur son node interne AVANT d'émettre le
      // change (`getSelectionChanges(…, mutateItem)`), et c'est ce node
      // interne que le rendu lit. Écarté, le change laisserait la frame
      // affichée sélectionnée ; appliqué à `false`, il produit un nouvel
      // objet node, que React Flow réadopte avec la bonne valeur.
      let changes = incomingChanges;
      if (isLassoActiveRef.current && isCtrlHeld) {
        const frameIds = new Set(
          getNodes()
            .filter((node) => node.type === "frame")
            .map((node) => node.id),
        );
        if (frameIds.size > 0) {
          changes = changes.map((change) =>
            change.type === "select" &&
            change.selected &&
            frameIds.has(change.id)
              ? { ...change, selected: false }
              : change,
          );
        }
      }

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

      // Move children along with dragged parent (when Ctrl is held)
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
            const nodesMap = new Map(currentNodes.map((n) => [n.id, n]));
            const childrenMap = buildChildrenMap(edges);
            const allDescendants = new Set<string>();
            // L'entraînement reste dans le repère du node attrapé : même frame
            // que lui, ou la racine s'il est à la racine. L'offset appliqué
            // plus bas est un delta, valable tel quel dans le repère relatif
            // d'une frame — à condition que le descendant ne change pas de
            // repère. Un node d'une autre frame (ou hors frame) reste où il
            // est, et le parcours ne passe pas à travers lui : on ne sort pas
            // un node de son groupe en déplaçant un voisin auquel il est
            // connecté. Les enfants d'une frame traînée tombent aussi hors
            // du repère : ils suivent déjà leur frame.
            for (const draggedId of draggedIds) {
              const scope = nodesMap.get(draggedId)?.parentId ?? null;
              for (const desc of collectDescendants(
                draggedId,
                childrenMap,
                new Set(draggedIds),
                (id) => (nodesMap.get(id)?.parentId ?? null) === scope,
              )) {
                allDescendants.add(desc);
              }
            }
            for (const id of draggedIds) {
              allDescendants.delete(id);
            }

            // Store initial offsets: descendant position - parent position at drag start
            const firstDraggedNode = nodesMap.get(draggedChanges[0].id);
            const initialOffsets = new Map<string, { x: number; y: number }>();
            if (firstDraggedNode) {
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

          // Redimensionner une frame par son bord gauche ou haut la déplace :
          // React Flow corrige alors la position RELATIVE de ses enfants pour
          // qu'ils ne bougent pas en coordonnées monde (cf. `childChanges`
          // dans `XYResizer`). Ces corrections arrivent ici comme des
          // changements de position sur des nodes qui ne sont, eux, pas
          // redimensionnés — et elles ne valaient jusqu'ici que pour l'écran :
          // sans elles dans l'écriture, la synchro Convex → React Flow qui
          // suit le relâcher rétablissait les positions d'avant et le contenu
          // partait avec le bord déplacé.
          //
          // Elles voyagent avec les dimensions, dans la même écriture et la
          // même entrée d'historique : un seul Ctrl+Z pour un seul coup de
          // souris, frame ET contenu.
          const resizedIds = new Set(
            dimensionChanges.map((change) => change.id),
          );
          const contentUpdates = savedPositionChanges.flatMap((change) =>
            change.position && !resizedIds.has(change.id)
              ? [{ nodeId: change.id, props: { position: change.position } }]
              : [],
          );

          const resizeUpdates: LayoutUpdate[] = [
            ...mergedChanges.map((change) => ({
              nodeId: change.id,
              props: {
                ...(change.position && { position: change.position }),
                ...(change.dimensions && {
                  width: change.dimensions.width,
                  height: change.dimensions.height,
                }),
              },
            })),
            ...contentUpdates,
          ];

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

  /**
   * Décide, à chaque frame du drag, dans quelle frame le node atterrirait.
   *
   * Ici et pas au relâcher : React Flow appelle `updateNodePositions` — donc
   * `handleNodeChange`, donc `flushDragPositions` — AVANT `onNodeDragStop`.
   * La décision doit être prise pendant le geste pour que le flush la trouve.
   *
   * Recalculé à chaque frame plutôt que mémorisé : c'est un test de point dans
   * quelques rectangles, et le survol doit suivre le curseur.
   */
  const onNodeDrag = useCallback(
    (_event: unknown, _node: Node, draggedNodes: Node[]) => {
      const current = getNodes();
      // Sortie immédiate sur un canvas sans frame — c'est-à-dire sur presque
      // tous. Ce handler tourne à chaque frame du geste : il ne doit rien
      // coûter quand il n'a rien à faire.
      const frames = current.filter((node) => node.type === "frame");
      if (frames.length === 0) return;

      const byId = new Map(current.map((node) => [node.id, node]));
      const pending = pendingReparentRef.current;

      let hovered: string | null = null;

      for (const dragged of draggedNodes) {
        const node = byId.get(dragged.id) ?? dragged;
        if (!canJoinFrame(node)) continue;

        const frame = findFrameAtPoint(frames, centerOf(node, byId));
        const previousParentId = node.parentId ?? null;
        const nextParentId = frame?.id ?? null;

        // La frame d'accueil s'entoure, y compris quand le node y était déjà :
        // le retour visuel dit « au relâcher, ce node est dans cette frame »,
        // pas « ce node change de frame ».
        if (nextParentId) hovered = nextParentId;

        if (nextParentId === previousParentId) {
          // Rien à écrire — et surtout : purger une décision prise plus tôt
          // dans le même geste, quand le node est ressorti d'où il venait.
          pending.delete(node.id);
          continue;
        }
        pending.set(node.id, {
          parentId: nextParentId,
          previousParentId,
        });
      }

      useFrameHoverStore.getState().setHoveredFrameId(hovered);
    },
    [getNodes],
  );

  /**
   * Le relâcher n'a plus qu'à éteindre la surbrillance : l'écriture est déjà
   * partie avec le flush des positions, dans la même mutation et la même
   * entrée d'historique.
   */
  const onNodeDragStop = useCallback(() => {
    useFrameHoverStore.getState().setHoveredFrameId(null);
  }, []);

  const onSelectionStart = useCallback(() => {
    isLassoActiveRef.current = true;
  }, []);

  const onSelectionEnd = useCallback(() => {
    isLassoActiveRef.current = false;
  }, []);

  return {
    nodes,
    setNodes,
    handleNodeChange,
    onNodeDrag,
    onNodeDragStop,
    onSelectionStart,
    onSelectionEnd,
  };
}
