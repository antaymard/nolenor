import { useCallback, useEffect } from "react";
import {
  applyEdgeChanges,
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
        (change) =>
          change.type !== "add" || change.item.source !== change.item.target,
      );
      if (filteredChanges.length === 0) {
        return;
      }

      const addedChanges = filteredChanges.filter(
        (change: EdgeChange) => change.type === "add",
      ) as EdgeAddChange[];
      const removedChanges = filteredChanges.filter(
        (change: EdgeChange) => change.type === "remove",
      ) as EdgeRemoveChange[];
      const otherChanges = filteredChanges.filter(
        (change: EdgeChange) => change.type !== "add",
      );

      // ADD EDGES — persistée en amont par `useCreateEdge` (onConnect) : le
      // change arrive déjà avec l'id serveur, rien à envoyer ici.
      //
      // Updater fonctionnel avec garde anti-doublon : le push Convex de
      // `edges.listFromCanvas` peut livrer l'edge (même llmId) AVANT l'add
      // local qui suit la réponse de mutation. Sans garde, l'array porte
      // deux fois le même id, React Flow rend deux `CustomEdge` sous la
      // même key, et leur label editor se referme aussitôt — le second
      // autofocus vole le focus du premier, blur → commit → fermeture.
      if (addedChanges.length > 0) {
        setEdges((current) => {
          const existing = new Set(current.map((edge) => edge.id));
          const toAdd = addedChanges.filter(
            (change) => !existing.has(change.item.id),
          );
          if (toAdd.length === 0) return current;
          return applyEdgeChanges(toAdd, current);
        });
      }

      if (otherChanges.length > 0) {
        onEdgesChange(otherChanges);
      }

      // REMOVE EDGES
      if (removedChanges.length > 0) {
        void trashEdgesInConvex({
          edgeIds: removedChanges.map((c) => c.id),
        }).catch((error) => {
          toastError(error, "Could not delete the connection");
        });
      }
    },
    [trashEdgesInConvex, onEdgesChange, setEdges],
  );

  return {
    edges,
    setEdges,
    handleEdgeChange,
  };
}
