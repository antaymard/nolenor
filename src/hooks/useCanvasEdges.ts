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
import { removeEdgesFromListQuery } from "@/lib/flowNodes";
import { toastError } from "@/components/utils/errorUtils";

export function useCanvasEdges(canvasId: Id<"canvases">, canvasEdges?: Edge[]) {
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // CONVEX MUTATIONS
  const trashEdgesInConvex = useMutation(api.edges.trash).withOptimisticUpdate(
    (localStore, { edgeIds }) => {
      removeEdgesFromListQuery(localStore, canvasId, edgeIds);
    },
  );

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
        // Persistée en amont par `useCreateEdge` (onConnect) : le change
        // arrive déjà avec l'id serveur, rien à envoyer ici.
        return;
      } else if (removedChanges.length > 0) {
        // REMOVE EDGES
        void trashEdgesInConvex({
          edgeIds: removedChanges.map((c) => c.id),
        }).catch((error) => {
          toastError(error, "Could not delete the connection");
        });
      }
    },
    [trashEdgesInConvex, onEdgesChange],
  );

  return {
    edges,
    setEdges,
    handleEdgeChange,
  };
}
