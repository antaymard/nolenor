import { useCallback } from "react";
import { useNodeDataStore } from "@/stores/nodeDataStore";
import type { Doc, Id } from "@/../convex/_generated/dataModel";

/**
 * Hook optimisé pour récupérer les values d'un NodeData.
 * Ne re-render que si les values de CE NodeData changent.
 */
export function useNodeDataValues(
  nodeDataId: Id<"nodeDatas"> | undefined,
): Record<string, unknown> | undefined {
  return useNodeDataStore(
    useCallback(
      (state) => {
        if (!nodeDataId) return undefined;
        return state.nodeDatas.get(nodeDataId)?.values;
      },
      [nodeDataId],
    ),
  );
}

/**
 * Hook optimisé pour récupérer UN champ spécifique des values d'un NodeData.
 * Ne re-render que si CE champ change (comparaison par référence).
 */
export function useNodeDataValuesField<T = unknown>(
  nodeDataId: Id<"nodeDatas"> | undefined,
  field: string,
): T | undefined {
  return useNodeDataStore(
    useCallback(
      (state) => {
        if (!nodeDataId) return undefined;
        return state.nodeDatas.get(nodeDataId)?.values?.[field] as
          | T
          | undefined;
      },
      [nodeDataId, field],
    ),
  );
}

/**
 * Hook optimisé pour récupérer un NodeData complet.
 * Ne re-render que si ce NodeData change.
 */
export function useNodeData(
  nodeDataId: Id<"nodeDatas"> | undefined,
): Doc<"nodeDatas"> | undefined {
  return useNodeDataStore(
    useCallback(
      (state) => {
        if (!nodeDataId) return undefined;
        return state.nodeDatas.get(nodeDataId);
      },
      [nodeDataId],
    ),
  );
}
