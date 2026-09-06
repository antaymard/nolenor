import { useCallback, useMemo } from "react";
import { useStore } from "@xyflow/react";
import type { Id } from "@/../convex/_generated/dataModel";
import { useNodeDataStore } from "@/stores/nodeDataStore";
import { getNodeDataId } from "@/lib/nodeIdentity";
import { getNodeDataTitle } from "@/components/utils/nodeDataDisplayUtils";

/** Une image telle que stockée dans `values.images` d'un node "image". */
type StoredImage = { url: string; filename?: string };

export type InputImageNode = {
  /** Id React Flow : c'est lui que les edges désignent, et ce que le backend attend. */
  nodeId: string;
  nodeDataId: Id<"nodeDatas">;
  title: string;
  images: StoredImage[];
};

/**
 * Deux tableaux portent-ils les mêmes chaînes, dans le même ordre ?
 *
 * Les sélecteurs ci-dessous rendent un tableau neuf à CHAQUE tick du store
 * React Flow, donc à chaque frame de pan, de zoom et de drag, pas seulement
 * quand les edges changent. Sans ce comparateur, le dialog de génération se
 * re-rendrait pendant tout un drag de canvas. Même raisonnement, et mêmes
 * raisons, que `haveSameEntries` dans `src/lib/nodeIdentity.ts`.
 */
function haveSameOrder(a: string[], b: string[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}

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
  // Deux sélecteurs plutôt qu'un seul qui ferait tout : celui-ci ne dépend que
  // du graphe, l'autre du contenu des nodes. Les images d'un node source
  // changent sans que le graphe bouge, et l'inverse.
  const sourceNodeIds = useStore(
    useCallback(
      (state) => {
        if (!xyNodeId) return [];
        return state.edges
          .filter((edge) => edge.target === xyNodeId)
          .map((edge) => edge.source);
      },
      [xyNodeId],
    ),
    haveSameOrder,
  );

  // Sérialisé en `"<nodeId> <nodeDataId>"` : le comparateur travaille sur des
  // chaînes, donc une Map ou un tableau d'objets rendrait une valeur neuve à
  // chaque tick et annulerait tout le bénéfice.
  //
  // Une seule passe sur `state.nodes`, et non un `find` par source : le
  // comparateur évite le re-render, pas l'exécution du sélecteur, qui tourne à
  // chaque frame de pan et de drag. Un `find` imbriqué y coûterait
  // O(sources × nodes) par frame — le piège que `nodeIdentity.ts` documente.
  const pairs = useStore(
    useCallback(
      (state) => {
        if (sourceNodeIds.length === 0) return [];

        const wanted = new Set(sourceNodeIds);
        const dataIdByNodeId = new Map<string, string>();
        for (const node of state.nodes) {
          if (!wanted.has(node.id)) continue;
          const dataId = getNodeDataId(node);
          if (dataId) dataIdByNodeId.set(node.id, dataId);
        }

        // Réémis dans l'ordre des edges, pas dans celui de `state.nodes` : c'est
        // l'ordre que les vignettes affichent, il ne doit pas sauter au gré des
        // réordonnancements du canvas.
        return sourceNodeIds
          .map((nodeId) => {
            const dataId = dataIdByNodeId.get(nodeId);
            return dataId ? `${nodeId} ${dataId}` : undefined;
          })
          .filter((entry): entry is string => entry !== undefined);
      },
      [sourceNodeIds],
    ),
    haveSameOrder,
  );

  const nodeDatas = useNodeDataStore((state) => state.nodeDatas);

  return useMemo(() => {
    const result: InputImageNode[] = [];

    for (const pair of pairs) {
      const [nodeId, rawDataId] = pair.split(" ");
      const nodeData = nodeDatas.get(rawDataId as Id<"nodeDatas">);
      if (!nodeData || nodeData.type !== "image") continue;

      const stored = Array.isArray(nodeData.values?.images)
        ? (nodeData.values.images as Array<{
            url?: unknown;
            filename?: unknown;
          }>)
        : [];

      const images: StoredImage[] = [];
      for (const image of stored) {
        if (typeof image?.url !== "string" || image.url.length === 0) continue;
        images.push({
          url: image.url,
          filename:
            typeof image.filename === "string" ? image.filename : undefined,
        });
      }
      if (images.length === 0) continue;

      result.push({
        nodeId,
        nodeDataId: rawDataId as Id<"nodeDatas">,
        title: getNodeDataTitle(nodeData),
        images,
      });
    }

    return result;
  }, [pairs, nodeDatas]);
}
