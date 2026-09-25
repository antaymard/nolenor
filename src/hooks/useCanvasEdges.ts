import { useCallback, useEffect } from "react";
import {
  applyEdgeChanges,
  useEdgesState,
  type Edge,
  type EdgeChange,
  type EdgeAddChange,
} from "@xyflow/react";

export function useCanvasEdges(canvasEdges?: Edge[]) {
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // Sync convex -> reactflow edges while preserving selection.
  // Sans ça, le moindre push (`data` d'une autre edge, bypass optimiste)
  // éteignait le halo de `CustomEdge` — y compris celui qu'on vient
  // d'allumer au clic droit dans `useContextMenu`. Même patron que les nodes
  // (`useCanvasNodes`), en plus simple : la sélection d'edges n'est que
  // locale, jamais persistée.
  useEffect(() => {
    if (canvasEdges !== undefined) {
      if (canvasEdges.length === 0) {
        setEdges([]);
        return;
      }
      setEdges((current) => {
        const selectedIds = new Set(
          current.filter((edge) => edge.selected).map((edge) => edge.id),
        );
        if (selectedIds.size === 0) return canvasEdges;
        return canvasEdges.map((edge) =>
          selectedIds.has(edge.id) ? { ...edge, selected: true } : edge,
        );
      });
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

      // REMOVE EDGES — appliquée localement par `onEdgesChange` ci-dessus,
      // persistée par `useDeleteCanvasElements` (une transaction avec les
      // nodes supprimés en même temps).
    },
    [onEdgesChange, setEdges],
  );

  return {
    edges,
    setEdges,
    handleEdgeChange,
  };
}
