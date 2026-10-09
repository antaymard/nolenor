import { useCallback, useMemo } from "react";
import { useReactFlow, type Node } from "@xyflow/react";
import { useMutation } from "convex/react";
import { api } from "@/../convex/_generated/api";
import {
  applyEdgeDataPatchesToListQuery,
  applyNodePatchesToListQuery,
} from "@/lib/flowNodes";
import { arrangeRects, type ArrangeCommand, type ArrangeRect } from "@/lib/arrangeNodes";
import { followEndpoints } from "@/lib/bendPointsFollow";
import { trackCanvasSync } from "@/lib/trackCanvasSync";
import { toastError } from "@/components/utils/errorUtils";
import { useCanvasStore } from "@/stores/canvasStore";
import { useCanvasHistoryStore, recordUndo } from "@/stores/canvasHistoryStore";
import type { EdgeBendPoint, EdgeCustomData } from "@/types/domain";

type XY = { x: number; y: number };

/** Libellés des commandes : menu et entrée d'historique. */
export const ARRANGE_LABELS: Record<ArrangeCommand, string> = {
  left: "Align left",
  hcenter: "Align horizontal centers",
  right: "Align right",
  top: "Align top",
  vcenter: "Align vertical centers",
  bottom: "Align bottom",
  distributeH: "Distribute horizontally",
  distributeV: "Distribute vertically",
  tidy: "Tidy up",
};

/**
 * Aligne, distribue ou range les nodes d'une sélection (cf. `arrangeNodes`).
 *
 * Les rectangles sont lus en coordonnées monde — un node de frame a une
 * position relative à sa frame — et les nouvelles positions y sont
 * reconverties avant écriture. L'appartenance aux frames ne change pas : on
 * aligne, on ne déménage pas.
 *
 * Écartés de la sélection : les nodes verrouillés (verrouiller, c'est
 * justement ne plus bouger), les masqués, et le contenu d'une frame elle-même
 * sélectionnée — il suit sa frame, comme au drag.
 */
export function useArrangeNodes() {
  const canvasId = useCanvasStore((state) => state.canvas?._id);
  const { getInternalNode, getEdges, setNodes, setEdges } = useReactFlow();

  // Mêmes optimistic updates que `useCanvasNodes` : la synchro Convex → React
  // Flow voit la nouvelle mise en page aussitôt, sans rebond.
  const patchNodes = useMutation(api.nodes.patch);
  const patchEdges = useMutation(api.edges.patch);
  const patchNodesOptimistic = useMemo(
    () =>
      patchNodes.withOptimisticUpdate((localStore, { updates }) => {
        if (canvasId) applyNodePatchesToListQuery(localStore, canvasId, updates);
      }),
    [patchNodes, canvasId],
  );
  const patchEdgesOptimistic = useMemo(
    () =>
      patchEdges.withOptimisticUpdate((localStore, { updates }) => {
        if (!canvasId) return;
        applyEdgeDataPatchesToListQuery(
          localStore,
          canvasId,
          updates.map((update) => ({ id: update.edgeId, data: update.data })),
        );
      }),
    [patchEdges, canvasId],
  );

  /** Les rectangles monde des nodes que l'arrangement peut déplacer. */
  const getArrangeableRects = useCallback(
    (nodes: Node[]): ArrangeRect[] => {
      const ids = new Set(nodes.map((node) => node.id));
      return nodes.flatMap((node) => {
        const internal = getInternalNode(node.id);
        if (!internal || internal.hidden || internal.draggable === false) {
          return [];
        }
        if (internal.parentId && ids.has(internal.parentId)) return [];
        const { width, height } = internal.measured;
        if (!width || !height) return [];
        const { x, y } = internal.internals.positionAbsolute;
        return [{ id: node.id, x, y, width, height }];
      });
    },
    [getInternalNode],
  );

  const arrangeNodes = useCallback(
    (nodes: Node[], command: ArrangeCommand) => {
      const rects = getArrangeableRects(nodes);
      const next = arrangeRects(rects, command);
      if (next.size === 0) return;

      // Monde → repère du node (sa frame, ou le canvas).
      const nodeUpdates: { nodeId: string; position: XY; before: XY }[] = [];
      const worldDelta = new Map<string, XY>();
      for (const rect of rects) {
        const target = next.get(rect.id);
        if (!target) continue;
        const internal = getInternalNode(rect.id)!;
        const parent = internal.parentId
          ? getInternalNode(internal.parentId)
          : undefined;
        const origin = parent?.internals.positionAbsolute ?? { x: 0, y: 0 };
        nodeUpdates.push({
          nodeId: rect.id,
          position: { x: target.x - origin.x, y: target.y - origin.y },
          before: internal.position,
        });
        worldDelta.set(rect.id, { x: target.x - rect.x, y: target.y - rect.y });
      }

      // Les bend points suivent leurs extrémités, comme au drag. Les enfants
      // d'une frame déplacée n'ont pas bougé dans leur repère, mais bien dans
      // le monde — où vivent les points.
      const deltaOf = (id: string): XY => {
        const own = worldDelta.get(id);
        if (own) return own;
        const parentId = getInternalNode(id)?.parentId;
        return (parentId && worldDelta.get(parentId)) || { x: 0, y: 0 };
      };
      const edgeUpdates = getEdges().flatMap((edge) => {
        const bendPoints = (edge.data as EdgeCustomData | undefined)
          ?.bendPoints as EdgeBendPoint[] | undefined;
        if (!bendPoints?.length) return [];
        const source = deltaOf(edge.source);
        const target = deltaOf(edge.target);
        if (!source.x && !source.y && !target.x && !target.y) return [];
        return [
          {
            edgeId: edge.id,
            before: bendPoints,
            after: followEndpoints(bendPoints, source, target),
          },
        ];
      });

      // Un seul geste, une seule entrée d'historique.
      const history = useCanvasHistoryStore.getState();
      history.begin(ARRANGE_LABELS[command]);
      try {
        recordUndo(
          {
            kind: "patchNodes",
            updates: nodeUpdates.map(({ nodeId, before }) => ({
              nodeId,
              props: { position: before },
            })),
          },
          {
            kind: "patchNodes",
            updates: nodeUpdates.map(({ nodeId, position }) => ({
              nodeId,
              props: { position },
            })),
          },
        );
        if (edgeUpdates.length > 0) {
          recordUndo(
            {
              kind: "patchEdges",
              updates: edgeUpdates.map(({ edgeId, before }) => ({
                edgeId,
                data: { bendPoints: before },
              })),
            },
            {
              kind: "patchEdges",
              updates: edgeUpdates.map(({ edgeId, after }) => ({
                edgeId,
                data: { bendPoints: after },
              })),
            },
          );
        }
      } finally {
        useCanvasHistoryStore.getState().end();
      }

      const positions = new Map(
        nodeUpdates.map(({ nodeId, position }) => [nodeId, position]),
      );
      setNodes((current) =>
        current.map((node) => {
          const position = positions.get(node.id);
          return position ? { ...node, position } : node;
        }),
      );
      void trackCanvasSync(() =>
        patchNodesOptimistic({
          updates: nodeUpdates.map(({ nodeId, position }) => ({
            nodeId,
            props: { position },
          })),
        }),
      ).catch((error: unknown) =>
        toastError(error, "Could not arrange the nodes"),
      );

      if (edgeUpdates.length > 0) {
        const bends = new Map(
          edgeUpdates.map(({ edgeId, after }) => [edgeId, after]),
        );
        setEdges((current) =>
          current.map((edge) => {
            const bendPoints = bends.get(edge.id);
            return bendPoints
              ? { ...edge, data: { ...(edge.data ?? {}), bendPoints } }
              : edge;
          }),
        );
        void trackCanvasSync(() =>
          patchEdgesOptimistic({
            updates: edgeUpdates.map(({ edgeId, after }) => ({
              edgeId,
              data: { bendPoints: after },
            })),
          }),
        ).catch((error: unknown) =>
          toastError(error, "Could not save the edge points"),
        );
      }
    },
    [
      getArrangeableRects,
      getInternalNode,
      getEdges,
      setNodes,
      setEdges,
      patchNodesOptimistic,
      patchEdgesOptimistic,
    ],
  );

  return { arrangeNodes, getArrangeableRects };
}
