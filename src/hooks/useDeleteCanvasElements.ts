import { useCallback } from "react";
import { useReactFlow, type Edge, type Node } from "@xyflow/react";
import {
  recordUndo,
  withUndoTransaction,
} from "@/stores/canvasHistoryStore";

type DeleteTarget = { nodes?: { id: string }[]; edges?: { id: string }[] };

type DeleteOptions = {
  /** Libellé du geste dans l'historique. */
  label?: string;
  /**
   * À `false`, la suppression n'entre pas dans la pile d'annulation. Réservé
   * aux suppressions qui ne sont que la moitié d'un geste dont l'autre moitié
   * n'est pas annulable : les rétablir seules laisserait un canvas incohérent,
   * ce qui est pire que pas d'annulation du tout.
   */
  undoable?: boolean;
};

/**
 * Supprime des éléments du canvas, en un seul geste annulable.
 *
 * Passe par `deleteElements` de React Flow, comme avant, mais en attend le
 * retour : il livre la liste EXACTE de ce qui a disparu — connexions
 * incidentes et nodes enfants compris, que l'appelant n'avait pas nommés.
 * C'est cette liste qui devient l'entrée d'historique, donc un Ctrl+Z rend le
 * node et ses connexions ensemble, jamais l'un sans les autres.
 *
 * Tous les points de suppression du canvas doivent passer par ici : appeler
 * `deleteElements` en direct supprime toujours, mais sans laisser de trace à
 * annuler.
 */
export function useDeleteCanvasElements() {
  const { deleteElements } = useReactFlow();

  const deleteCanvasElements = useCallback(
    async (
      target: DeleteTarget,
      { label = "Delete", undoable = true }: DeleteOptions = {},
    ): Promise<{ deletedNodes: Node[]; deletedEdges: Edge[] }> => {
      const { deletedNodes, deletedEdges } = await deleteElements(target);

      if (!undoable) return { deletedNodes, deletedEdges };

      const nodeIds = deletedNodes.map((node) => node.id);
      const edgeIds = deletedEdges.map((edge) => edge.id);
      if (nodeIds.length === 0 && edgeIds.length === 0) {
        return { deletedNodes, deletedEdges };
      }

      await withUndoTransaction(label, () => {
        if (nodeIds.length > 0) {
          recordUndo(
            { kind: "untrashNodes", nodeIds },
            { kind: "trashNodes", nodeIds },
          );
        }
        if (edgeIds.length > 0) {
          recordUndo(
            { kind: "untrashEdges", edgeIds },
            { kind: "trashEdges", edgeIds },
          );
        }
      });

      return { deletedNodes, deletedEdges };
    },
    [deleteElements],
  );

  return { deleteCanvasElements };
}
