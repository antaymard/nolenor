import { useCallback, useRef } from "react";
import { useReactFlow, type Edge } from "@xyflow/react";
import { useParams } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import type { Edge as CanvasEdge } from "@/types/convex";
import { toastError } from "@/components/utils/errorUtils";

interface UpdateEdgeInput {
  edgeId: string;
  /**
   * Partial edge data to merge onto the existing `edge.data`.
   * Use `null` as a value to clear a field (e.g. `{ label: null }`).
   * The Convex `updateCanvasEdges` model does a shallow merge, so keys
   * not present here are preserved.
   */
  data: Record<string, unknown>;
}

interface UseUpdateCanvasEdgeReturn {
  updateCanvasEdge: (input: UpdateEdgeInput) => Promise<void>;
  updateCanvasEdges: (inputs: UpdateEdgeInput[]) => Promise<void>;
  isUpdating: boolean;
}

/**
 * Persists edge `data` updates (label, color, strokeWidth, strokeStyle,
 * bendPoints, markers) to Convex via `api.canvasEdges.update`, with an
 * optimistic update of the `readCanvas` query so the convex → reactflow
 * sync in `useCanvasEdges` does not briefly bounce `data` back to its
 * pre-mutation value.
 *
 * Mirrors `useUpdateCanvasNode` (snapshot / optimistic / revert on error).
 */
export function useUpdateCanvasEdge(): UseUpdateCanvasEdgeReturn {
  const { canvasId }: { canvasId: Id<"canvases"> } = useParams({
    from: "/canvas/$canvasId",
  });

  const { getEdge, setEdges } = useReactFlow();

  const updateCanvasEdgesMutation = useMutation(
    api.canvasEdges.update,
  ).withOptimisticUpdate(
    (localStore, { canvasId: targetCanvasId, edgeUpdates }) => {
      const existing = localStore.getQuery(api.canvases.readCanvas, {
        canvasId: targetCanvasId,
      });
      if (!existing || !existing.edges) return;
      const updatesById = new Map<
        string,
        Record<string, unknown> | undefined
      >();
      for (const item of edgeUpdates as Array<{
        id: string;
        data?: Record<string, unknown>;
      }>) {
        updatesById.set(item.id, item.data);
      }
      if (updatesById.size === 0) return;
      localStore.setQuery(
        api.canvases.readCanvas,
        { canvasId: targetCanvasId },
        {
          ...existing,
          edges: existing.edges.map((edge: CanvasEdge) => {
            const dataUpdate = updatesById.get(edge.id);
            if (dataUpdate === undefined) return edge;
            const nextData = mergeEdgeData(edge.data, dataUpdate);
            return { ...edge, data: nextData };
          }),
        },
      );
    },
  );

  const snapshotsRef = useRef<Map<string, Edge>>(new Map());
  const isUpdatingRef = useRef(false);

  const saveSnapshot = useCallback(
    (edgeId: string): boolean => {
      const edge = getEdge(edgeId);
      if (!edge) {
        console.warn(`[useUpdateCanvasEdge] Edge ${edgeId} not found`);
        return false;
      }
      snapshotsRef.current.set(edgeId, structuredClone(edge));
      return true;
    },
    [getEdge],
  );

  const revertEdges = useCallback(
    (edgeIds: string[]) => {
      setEdges((currentEdges) => {
        const result = currentEdges.map((edge) => {
          if (!edgeIds.includes(edge.id)) return edge;
          const snapshot = snapshotsRef.current.get(edge.id);
          return snapshot ?? edge;
        });
        edgeIds.forEach((id) => snapshotsRef.current.delete(id));
        return result;
      });
    },
    [setEdges],
  );

  const applyLocalUpdates = useCallback(
    (inputs: UpdateEdgeInput[]) => {
      const inputsMap = new Map(inputs.map((i) => [i.edgeId, i]));

      setEdges((currentEdges) =>
        currentEdges.map((edge) => {
          const input = inputsMap.get(edge.id);
          if (!input) return edge;
          const nextData = mergeEdgeData(
            (edge.data ?? {}) as Record<string, unknown>,
            input.data,
          );
          return { ...edge, data: nextData };
        }),
      );
    },
    [setEdges],
  );

  const executeServerUpdate = useCallback(
    async (inputs: UpdateEdgeInput[]): Promise<void> => {
      const edgeUpdates = inputs.map(({ edgeId, data }) => ({
        id: edgeId,
        data: data as Record<string, unknown>,
      }));

      await updateCanvasEdgesMutation({
        canvasId,
        edgeUpdates,
      });
    },
    [canvasId, updateCanvasEdgesMutation],
  );

  const updateEdges = useCallback(
    async (inputs: UpdateEdgeInput[]): Promise<void> => {
      if (inputs.length === 0) return;

      const validInputs = inputs.filter((input) =>
        saveSnapshot(input.edgeId),
      );
      if (validInputs.length === 0) return;

      isUpdatingRef.current = true;
      applyLocalUpdates(validInputs);

      try {
        await executeServerUpdate(validInputs);
        validInputs.forEach((input) =>
          snapshotsRef.current.delete(input.edgeId),
        );
      } catch (error) {
        revertEdges(validInputs.map((i) => i.edgeId));
        toastError(error, "Error updating edge");
      } finally {
        isUpdatingRef.current = false;
      }
    },
    [saveSnapshot, applyLocalUpdates, executeServerUpdate, revertEdges],
  );

  const updateEdge = useCallback(
    async (input: UpdateEdgeInput): Promise<void> => {
      return updateEdges([input]);
    },
    [updateEdges],
  );

  return {
    updateCanvasEdge: updateEdge,
    updateCanvasEdges: updateEdges,
    isUpdating: isUpdatingRef.current,
  };
}

/**
 * Merge an edge data update into the existing data.
 *
 * The Convex `updateCanvasEdges` model does a shallow merge:
 *   `{ ...(edge.data ?? {}), ...update.data }`
 * To delete a field (e.g. clearing a label), the caller passes `null` or
 * `""` for that key. We mirror the same semantics on the client so the
 * optimistic update matches what the server will persist.
 */
function mergeEdgeData(
  existing: Record<string, unknown> | undefined,
  update: Record<string, unknown>,
): Record<string, unknown> {
  return { ...(existing ?? {}), ...update };
}
