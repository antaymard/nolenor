import { useCallback } from "react";
import { useNodeDataStore } from "@/stores/nodeDataStore";
import { useTemplatesStore } from "@/stores/templatesStore";
import type { Id } from "@/../convex/_generated/dataModel";
import { getNodeDataTitle } from "@/components/utils/nodeDataDisplayUtils";

export function useNodeDataTitle(
  nodeDataId: Id<"nodeDatas"> | undefined,
): string | undefined {
  return useNodeDataStore(
    useCallback(
      (state) => {
        if (!nodeDataId) return undefined;
        const nodeData = state.nodeDatas.get(nodeDataId);
        if (!nodeData) return undefined;
        // Custom : le titre exact vient du template (titleFieldId). Lecture
        // par getState (pas de souscription croisée) — le titre suit les
        // changements de values, un rename de titleFieldId se rafraîchit au
        // prochain render.
        const template = nodeData.templateId
          ? useTemplatesStore.getState().templates.get(nodeData.templateId)
          : undefined;
        return getNodeDataTitle(nodeData, template ?? null);
      },
      [nodeDataId],
    ),
  );
}
