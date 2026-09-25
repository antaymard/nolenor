import { useCallback, useMemo } from "react";
import { useReactFlow, type Edge, type Node } from "@xyflow/react";
import { useMutation } from "convex/react";
import { useParams } from "@tanstack/react-router";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import type { CanvasOp } from "@/../convex/schemas/canvasOpsSchema";
import {
  removeEdgesFromListQuery,
  removeNodesFromListQuery,
} from "@/lib/flowNodes";
import { trackCanvasSync } from "@/lib/trackCanvasSync";
import { toastError } from "@/components/utils/errorUtils";
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
 * C'est aussi ici que la suppression est persistée, en UNE transaction
 * (`canvasOps.apply`) pour les nodes et leurs connexions. React Flow émet les
 * deux sous forme de changements séparés — edges d'abord, nodes ensuite — et
 * les persister chacun de son côté donnait deux mutations, donc deux
 * `trashedAt` : la modale corbeille, qui rend les edges portant exactement la
 * date du node, restaurait alors le node sans ses connexions.
 *
 * Tous les points de suppression du canvas doivent passer par ici : appeler
 * `deleteElements` en direct retire les éléments de l'écran, mais sans les
 * persister ni laisser de trace à annuler.
 */
export function useDeleteCanvasElements() {
  const { deleteElements } = useReactFlow();
  const { canvasId }: { canvasId: Id<"canvases"> } = useParams({
    from: "/canvas/$canvasId",
  });

  const applyOps = useMutation(api.canvasOps.apply);
  const trashInConvex = useMemo(
    () =>
      applyOps.withOptimisticUpdate((localStore, { canvasId: target, ops }) => {
        for (const op of ops) {
          if (op.kind === "trashNodes") {
            removeNodesFromListQuery(localStore, target, op.nodeIds);
          } else if (op.kind === "trashEdges") {
            removeEdgesFromListQuery(localStore, target, op.edgeIds);
          }
        }
      }),
    [applyOps],
  );

  const deleteCanvasElements = useCallback(
    async (
      target: DeleteTarget,
      { label = "Delete", undoable = true }: DeleteOptions = {},
    ): Promise<{ deletedNodes: Node[]; deletedEdges: Edge[] }> => {
      const { deletedNodes, deletedEdges } = await deleteElements(target);

      const nodeIds = deletedNodes.map((node) => node.id);
      const edgeIds = deletedEdges.map((edge) => edge.id);
      if (nodeIds.length === 0 && edgeIds.length === 0) {
        return { deletedNodes, deletedEdges };
      }

      const ops: CanvasOp[] = [];
      if (nodeIds.length > 0) ops.push({ kind: "trashNodes", nodeIds });
      if (edgeIds.length > 0) ops.push({ kind: "trashEdges", edgeIds });
      void trackCanvasSync(() => trashInConvex({ canvasId, ops })).catch(
        (error: unknown) => {
          toastError(error, "Could not delete these elements");
        },
      );

      if (!undoable) return { deletedNodes, deletedEdges };

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
    [deleteElements, trashInConvex, canvasId],
  );

  return { deleteCanvasElements };
}
