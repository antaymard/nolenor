import { useCallback, useEffect } from "react";
import {
  useEdgesState,
  type Edge,
  type EdgeChange,
  type EdgeAddChange,
  type EdgeRemoveChange,
} from "@xyflow/react";
import { useMutation } from "convex/react";
import type { Id } from "@/../convex/_generated/dataModel";
import { api } from "@/../convex/_generated/api";

export function useCanvasEdges(canvasId: Id<"canvases">, canvasEdges?: Edge[]) {
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // CONVEX MUTATIONS
  const addCanvasEdgesToConvex = useMutation(api.canvasEdges.add);
  const removeCanvasEdgesInConvex = useMutation(api.canvasEdges.remove);

  // Sync convex -> reactflow edges
  useEffect(() => {
    if (canvasEdges !== undefined) {
      if (canvasEdges.length === 0) {
        setEdges([]);
        return;
      }
      setEdges(canvasEdges);
    }
  }, [canvasEdges, setEdges]);

  const handleEdgeChange = useCallback(
    (changes: EdgeChange[]) => {
      // Un node ne peut pas être connecté à lui-même : on ignore les
      // auto-connexions pour ne ni les afficher ni les persister.
      const filteredChanges = changes.filter(
        (change) => change.type !== "add" || change.item.source !== change.item.target,
      );
      if (filteredChanges.length === 0) {
        return;
      }
      onEdgesChange(filteredChanges);

      const addedChanges = filteredChanges.filter(
        (change: EdgeChange) => change.type === "add",
      ) as EdgeAddChange[];
      const removedChanges = filteredChanges.filter(
        (change: EdgeChange) => change.type === "remove",
      ) as EdgeRemoveChange[];

      // ADD EDGES
      if (addedChanges.length > 0) {
        // Envoi direct à Convex
        return addCanvasEdgesToConvex({
          edges: addedChanges.map((c) => ({
            ...c.item,
            sourceHandle: c.item.sourceHandle ?? undefined,
            targetHandle: c.item.targetHandle ?? undefined,
          })),
          canvasId,
        });
      } else if (removedChanges.length > 0) {
        // REMOVE EDGES
        // Envoi direct à Convex
        removeCanvasEdgesInConvex({
          edgeIds: removedChanges.map((c) => c.id),
          canvasId,
        });
      }
    },
    [
      canvasId,
      addCanvasEdgesToConvex,
      removeCanvasEdgesInConvex,
      onEdgesChange,
    ],
  );

  return {
    edges,
    setEdges,
    handleEdgeChange,
  };
}
