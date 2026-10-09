import { useCallback, useEffect, useMemo, useRef } from "react";
import { useReactFlow, type Node } from "@xyflow/react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/../convex/_generated/api";
import {
  applyEdgeDataPatchesToListQuery,
  applyNodePatchesToListQuery,
} from "@/lib/flowNodes";
import { computeFrameFit, type XY } from "@/lib/frameFit";
import { trackCanvasSync } from "@/lib/trackCanvasSync";
import { toastError } from "@/components/utils/errorUtils";
import { useCanvasStore } from "@/stores/canvasStore";
import { recordUndo, useCanvasHistoryStore } from "@/stores/canvasHistoryStore";
import type { EdgeBendPoint, EdgeCustomData } from "@/types/domain";

type Size = { width: number; height: number };

function sizeOf(node: Node): Size {
  return {
    width: node.measured?.width ?? node.width ?? 0,
    height: node.measured?.height ?? node.height ?? 0,
  };
}

/**
 * La frame qui s'agrandit pour contenir ce qu'on lâche hors de ses bords,
 * depuis sa window (cf. `computeFrameFit`, `FrameWindow`).
 *
 * Doit être appelé sous le provider React Flow DU CANVAS : on lit et on écrit
 * ses nodes, pas ceux de la window.
 *
 * La taille de référence est la taille STOCKÉE de la frame, lue dans la query
 * Convex : sur le canvas, une frame compacte a la taille de sa carte (cf.
 * `frameVariant`), pas celle qu'elle retrouvera dépliée.
 */
export function useFrameFit(frameId: string) {
  const canvasId = useCanvasStore((state) => state.canvas?._id);
  const { getNode, getNodes, getEdges } = useReactFlow();

  // Déjà souscrite par le bootstrap du canvas : servie par le cache client.
  const tableNodes = useQuery(
    api.nodes.listFromCanvas,
    canvasId ? { canvasId } : "skip",
  );
  const storedFrame = tableNodes?.find((node) => node.id === frameId);
  const storedWidth = storedFrame?.width;
  const storedHeight = storedFrame?.height;
  const frameSize = useMemo<Size | null>(
    () =>
      storedWidth && storedHeight
        ? { width: storedWidth, height: storedHeight }
        : null,
    [storedWidth, storedHeight],
  );
  // Lu à la volée par `fitFrame`, appelée hors rendu.
  const frameSizeRef = useRef(frameSize);
  frameSizeRef.current = frameSize;

  // Mêmes optimistic updates que `useCanvasNodes` : la synchro Convex → React
  // Flow voit la nouvelle mise en page aussitôt, sans rebond.
  const patchNodes = useMutation(api.nodes.patch);
  const patchEdges = useMutation(api.edges.patch);
  const patchNodesOptimistic = useMemo(
    () =>
      patchNodes.withOptimisticUpdate((localStore, { updates }) => {
        if (canvasId)
          applyNodePatchesToListQuery(localStore, canvasId, updates);
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

  /**
   * Agrandit la frame (et décale son contenu si besoin) pour que tous ses
   * enfants y tiennent. `positions` prend le pas sur l'état du canvas pour les
   * nodes qu'il nomme : au relâcher d'un drag, c'est la window qui connaît la
   * position finale à coup sûr.
   */
  const fitFrame = useCallback(
    ({
      allowShift,
      undoable,
      positions,
    }: {
      allowShift: boolean;
      undoable: boolean;
      positions?: Map<string, XY>;
    }) => {
      const frame = getNode(frameId);
      const stored = frameSizeRef.current;
      if (!frame || !stored) return;

      const children = getNodes().filter((node) => node.parentId === frameId);
      const rects = children.map((node) => ({
        id: node.id,
        ...(positions?.get(node.id) ?? node.position),
        ...sizeOf(node),
      }));
      const fit = computeFrameFit(stored, rects, { allowShift });
      if (!fit) return;

      const { shift } = fit;
      const shifted = shift.x !== 0 || shift.y !== 0;

      const redoNodes = [
        {
          nodeId: frameId,
          props: { width: fit.width, height: fit.height },
        },
        ...(shifted
          ? rects.map((rect) => ({
              nodeId: rect.id,
              props: { position: { x: rect.x + shift.x, y: rect.y + shift.y } },
            }))
          : []),
      ];
      const undoNodes = [
        { nodeId: frameId, props: { ...stored } },
        ...(shifted
          ? rects.map((rect) => ({
              nodeId: rect.id,
              props: { position: { x: rect.x, y: rect.y } },
            }))
          : []),
      ];

      // Les points de courbure sont en coordonnées monde : la frame ne bouge
      // pas, son contenu si — ils le suivent du même décalage.
      const ids = new Set(rects.map((rect) => rect.id));
      const bentEdges = shifted
        ? getEdges().filter(
            (edge) =>
              ids.has(edge.source) &&
              ids.has(edge.target) &&
              ((edge.data as EdgeCustomData | undefined)?.bendPoints?.length ??
                0) > 0,
          )
        : [];
      const bendsOf = (edgeData: unknown) =>
        ((edgeData as EdgeCustomData | undefined)?.bendPoints ??
          []) as EdgeBendPoint[];
      const redoEdges = bentEdges.map((edge) => ({
        edgeId: edge.id,
        data: {
          bendPoints: bendsOf(edge.data).map((point) => ({
            ...point,
            x: point.x + shift.x,
            y: point.y + shift.y,
          })),
        },
      }));
      const undoEdges = bentEdges.map((edge) => ({
        edgeId: edge.id,
        data: { bendPoints: bendsOf(edge.data) },
      }));

      if (undoable) {
        recordUndo(
          { kind: "patchNodes", updates: undoNodes },
          { kind: "patchNodes", updates: redoNodes },
        );
        if (redoEdges.length > 0) {
          recordUndo(
            { kind: "patchEdges", updates: undoEdges },
            { kind: "patchEdges", updates: redoEdges },
          );
        }
      }

      void trackCanvasSync(() =>
        patchNodesOptimistic({ updates: redoNodes }),
      ).catch((error: unknown) =>
        toastError(error, "Could not resize the frame"),
      );
      if (redoEdges.length > 0) {
        void trackCanvasSync(() =>
          patchEdgesOptimistic({ updates: redoEdges }),
        ).catch((error: unknown) =>
          toastError(error, "Could not save the edge points"),
        );
      }
    },
    [
      frameId,
      getEdges,
      getNode,
      getNodes,
      patchEdgesOptimistic,
      patchNodesOptimistic,
    ],
  );

  /**
   * À appeler au relâcher d'un geste (drag, redimensionnement), APRÈS que le
   * canvas a écrit le geste : l'agrandissement rejoint son entrée
   * d'historique — un seul Ctrl+Z défait les deux.
   *
   * La transaction est ouverte tout de suite, pendant que le brouillon
   * implicite du geste est encore ouvert (il se referme à la microtâche, cf.
   * `record`), et le calcul attend la frame d'affichage suivante : l'état du
   * canvas a alors reçu les positions du geste.
   */
  const fitAfterGesture = useCallback(
    (positions?: Map<string, XY>) => {
      useCanvasHistoryStore.getState().begin("Move");
      requestAnimationFrame(() => {
        try {
          fitFrame({ allowShift: true, undoable: true, positions });
        } finally {
          useCanvasHistoryStore.getState().end();
        }
      });
    },
    [fitFrame],
  );

  return { frameSize, fitFrame, fitAfterGesture };
}

/**
 * Un enfant qui apparaît dans la frame (créé depuis la window, ou par
 * quelqu'un d'autre) et qui déborde : la frame s'agrandit vers la droite et
 * le bas. Pas de décalage — un node fraîchement créé n'est pas encore
 * patchable côté serveur —, et pas d'entrée d'historique : ce n'est pas un
 * geste en soi.
 */
export function useFitFrameOnNewChildren(
  childIds: ReadonlySet<string>,
  fitFrame: ReturnType<typeof useFrameFit>["fitFrame"],
  enabled: boolean,
) {
  const seenRef = useRef<ReadonlySet<string> | null>(null);
  useEffect(() => {
    const seen = seenRef.current;
    seenRef.current = childIds;
    if (!seen || !enabled) return;
    for (const id of childIds) {
      if (!seen.has(id)) {
        fitFrame({ allowShift: false, undoable: false });
        return;
      }
    }
  }, [childIds, enabled, fitFrame]);
}
