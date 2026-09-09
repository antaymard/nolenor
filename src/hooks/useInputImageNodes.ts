import { useCallback, useMemo } from "react";
import { useStore } from "@xyflow/react";
import type { Id } from "@/../convex/_generated/dataModel";
import { readStoredImages } from "@/../convex/lib/storedImages";
import { useNodeDataStore } from "@/stores/nodeDataStore";
import { getNodeDataId, haveSameEntries } from "@/lib/nodeIdentity";
import { getNodeDataTitle } from "@/components/utils/nodeDataDisplayUtils";

export type InputImageNode = {
  /** Id React Flow : c'est lui que les edges désignent. */
  nodeId: string;
  /** Ce que le backend attend : un id global, pas une chaîne à portée canvas. */
  nodeDataId: Id<"nodeDatas">;
  title: string;
  /** Toujours au moins une : un node sans image n'est pas rendu ici. */
  imageUrls: string[];
};

/**
 * Les nodes image branchés EN ENTRÉE de `xyNodeId`, dans l'ordre des edges.
 *
 * Même relation que celle que `useAppNodeRunner` lit pour les nodes app
 * (`src/hooks/useAppNodeRunner.ts`) : un edge dont le `target` est ce node fait
 * de son `source` une entrée. C'est aussi la règle que la mutation
 * `generateImages` revalide côté serveur : ici on ne fait qu'afficher ce qui
 * est légal, la barrière est là-bas.
 *
 * Les nodes sans image sont écartés : les joindre en référence n'enverrait
 * rien, et une vignette vide ne veut rien dire pour l'utilisateur.
 */
export function useInputImageNodes(
  xyNodeId: string | undefined,
): InputImageNode[] {
  // Une Map plutôt qu'un tableau sérialisé : `useNodeIdsByDataId`
  // (`src/lib/nodeIdentity.ts`) résout le même problème et son commentaire
  // rejette explicitement la sérialisation — aucun échappement à prévoir, et
  // plus de question de séparateur dans des ids qui sont des chaînes libres.
  // Le comparateur est le sien, exporté plutôt que recopié.
  //
  // Un sélecteur de store tourne à CHAQUE tick, le comparateur n'évite que le
  // re-render. D'où `nodeLookup`, un index déjà construit par React Flow : le
  // coût est en O(entrées) et non en O(nodes du canvas).
  const dataIdByNodeId = useStore(
    useCallback(
      (state) => {
        const byNodeId = new Map<string, Id<"nodeDatas">>();
        if (!xyNodeId) return byNodeId;

        for (const edge of state.edges) {
          if (edge.target !== xyNodeId) continue;
          const dataId = getNodeDataId(state.nodeLookup.get(edge.source));
          // Insertion dans l'ordre des edges, que la Map préserve : c'est
          // l'ordre dans lequel les vignettes s'affichent.
          if (dataId) byNodeId.set(edge.source, dataId);
        }
        return byNodeId;
      },
      [xyNodeId],
    ),
    haveSameEntries,
  );

  const nodeDatas = useNodeDataStore((state) => state.nodeDatas);

  return useMemo(() => {
    const result: InputImageNode[] = [];

    for (const [nodeId, nodeDataId] of dataIdByNodeId) {
      const nodeData = nodeDatas.get(nodeDataId);
      if (!nodeData || nodeData.type !== "image") continue;

      const imageUrls = readStoredImages(nodeData.values).map(
        (image) => image.url,
      );
      if (imageUrls.length === 0) continue;

      result.push({
        nodeId,
        nodeDataId,
        title: getNodeDataTitle(nodeData),
        imageUrls,
      });
    }

    return result;
  }, [dataIdByNodeId, nodeDatas]);
}
