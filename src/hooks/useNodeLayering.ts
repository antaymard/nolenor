import { useCallback } from "react";
import { useReactFlow } from "@xyflow/react";
import { useUpdateCanvasNode } from "@/hooks/useUpdateCanvasNode";
import { computeLayerUpdates, type LayerCommand } from "@/lib/nodeLayering";

/**
 * Applique une commande de plan (premier plan / avancer / reculer /
 * arrière-plan) à un ou plusieurs nodes.
 *
 * Toute la logique d'ordre vit dans `@/lib/nodeLayering` ; ici on ne fait que
 * lire l'état courant de React Flow et pousser le résultat en **un seul appel**
 * à `updateCanvasNodes`, qui gère déjà l'update optimiste, le rollback et le
 * statut de sync.
 */
export function useNodeLayering() {
  const { getNodes } = useReactFlow();
  const { updateCanvasNodes } = useUpdateCanvasNode();

  const applyLayerCommand = useCallback(
    (command: LayerCommand, nodeIds: string[]) => {
      if (nodeIds.length === 0) return;

      const updates = computeLayerUpdates(
        getNodes(),
        new Set(nodeIds),
        command,
      );
      // Rien à écrire : la sélection est déjà à sa place.
      if (updates.length === 0) return;

      void updateCanvasNodes(updates);
    },
    [getNodes, updateCanvasNodes],
  );

  const applyLayerCommandToSelection = useCallback(
    (command: LayerCommand) => {
      const selectedIds = getNodes()
        .filter((node) => node.selected)
        .map((node) => node.id);
      applyLayerCommand(command, selectedIds);
    },
    [getNodes, applyLayerCommand],
  );

  return { applyLayerCommand, applyLayerCommandToSelection };
}
