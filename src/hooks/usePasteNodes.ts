import { useCallback } from "react";
import type { XYPosition } from "@xyflow/react";
import { useNodeClipboardStore } from "@/stores/nodeClipboardStore";
import { useCreateNodesFromItems } from "./useCreateNodesFromItems";

/**
 * Colle le contenu du presse-papiers interne (Ctrl+C sur le canvas) au point
 * donné — le curseur suivi, comme les raccourcis de création. Fine couche sur
 * `useCreateNodesFromItems`, partagée avec le duplicate.
 */
export function usePasteNodes() {
  const { createNodesFromItems } = useCreateNodesFromItems();

  const pasteNodesAt = useCallback(
    async (position: XYPosition): Promise<void> => {
      const items = useNodeClipboardStore.getState().items;
      if (items.length === 0) return;
      await createNodesFromItems(items, position, "pasted");
    },
    [createNodesFromItems],
  );

  return { pasteNodesAt };
}
