import { useCallback, useRef } from "react";
import { useReactFlow, type Edge } from "@xyflow/react";
import { useParams } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import { applyEdgeDataPatchesToListQuery } from "@/lib/flowNodes";
import { toastError } from "@/components/utils/errorUtils";
import { trackCanvasSync } from "@/lib/trackCanvasSync";
import { recordUndo } from "@/stores/canvasHistoryStore";

interface UpdateEdgeInput {
  edgeId: string;
  /**
   * Partial edge data to merge onto the existing `edge.data`.
   * Use `null` as a value to clear a field (e.g. `{ label: null }`).
   * The Convex `edges.patch` mutation does a shallow merge, so keys
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
 * bendPoints, markers) to Convex via `api.edges.patch`, with an
 * optimistic update of the `edges.listFromCanvas` query so the convex →
 * reactflow sync in `useCanvasEdges` does not briefly bounce `data` back
 * to its pre-mutation value.
 *
 * Mirrors `useUpdateCanvasNode` (snapshot / optimistic / revert on error).
 */
export function useUpdateCanvasEdge(): UseUpdateCanvasEdgeReturn {
  const { canvasId }: { canvasId: Id<"canvases"> } = useParams({
    from: "/canvas/$canvasId",
  });

  const { getEdge, setEdges } = useReactFlow();

  const updateEdgesMutation = useMutation(
    api.edges.patch,
  ).withOptimisticUpdate((localStore, { updates }) => {
    applyEdgeDataPatchesToListQuery(
      localStore,
      canvasId,
      updates.map((update) => ({ id: update.edgeId, data: update.data })),
    );
  });

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
      await trackCanvasSync(() =>
        updateEdgesMutation({
          updates: inputs.map(({ edgeId, data }) => ({
            edgeId,
            data: data as Record<string, unknown>,
          })),
        }),
      );
    },
    [updateEdgesMutation],
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

        // L'inverse se lit dans les snapshots déjà pris pour le rollback
        // d'erreur. Une clé absente du snapshot revient à `null` : c'est la
        // convention d'effacement du merge shallow (cf. `mergeEdgeData`), donc
        // l'inverse d'un ajout de clé est bien sa disparition.
        const undoUpdates = validInputs.flatMap((input) => {
          const snapshot = snapshotsRef.current.get(input.edgeId);
          if (!snapshot) return [];
          const previous = (snapshot.data ?? {}) as Record<string, unknown>;
          return [
            {
              edgeId: input.edgeId,
              data: Object.fromEntries(
                Object.keys(input.data).map((key) => [
                  key,
                  previous[key] ?? null,
                ]),
              ),
            },
          ];
        });
        if (undoUpdates.length > 0) {
          recordUndo(
            { kind: "patchEdges", updates: undoUpdates },
            {
              kind: "patchEdges",
              updates: validInputs.map(({ edgeId, data }) => ({
                edgeId,
                data: data as Record<string, unknown>,
              })),
            },
          );
        }

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
 * The Convex `edges.patch` mutation does a shallow merge:
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
