import { useCallback, useMemo } from "react";
import { useStore } from "@xyflow/react";
import type { Id } from "@/../convex/_generated/dataModel";

/**
 * Le minimum pour reconnaître un node : son id React Flow, et le `nodeDataId`
 * dans l'un ou l'autre de ses deux domiciles.
 *
 * Deux domiciles, parce que l'id est stocké au premier niveau du node de canvas
 * (`canvasesSchema.ts`, optionnel) et dupliqué dans la charge React Flow
 * (`XyNodeData`, requis). Les call sites lisent presque tous le second — ce
 * helper accepte les deux pour de bon, plutôt que de reposer sur le fait que la
 * duplication soit toujours à jour.
 */
type NodeIdentityLike = {
  id?: string;
  nodeDataId?: Id<"nodeDatas"> | null;
  data?: Record<string, unknown> | null;
};

/** Le `nodeDataId` d'un node, quel que soit le domicile où il se trouve. */
export function getNodeDataId(
  node: NodeIdentityLike | null | undefined,
): Id<"nodeDatas"> | undefined {
  if (!node) return undefined;
  if (node.nodeDataId) return node.nodeDataId;
  const fromData = node.data?.nodeDataId;
  return typeof fromData === "string"
    ? (fromData as Id<"nodeDatas">)
    : undefined;
}

/**
 * L'id React Flow du node qui porte ce `nodeDataId`, ou `undefined` s'il n'est
 * plus sur le canvas.
 *
 * Pur : pour les callbacks qui lisent `getNodes()` ponctuellement. Quand on
 * rend, c'est `useNodeIdsByDataId` qu'il faut — même convention que
 * `getCanvasNodeTitle`, souscription au rendu et lecture ponctuelle ailleurs.
 */
export function findNodeIdByDataId(
  nodes: readonly NodeIdentityLike[],
  nodeDataId: Id<"nodeDatas"> | undefined,
): string | undefined {
  if (!nodeDataId) return undefined;
  return nodes.find((node) => getNodeDataId(node) === nodeDataId)?.id;
}

type NodeIdPair = [nodeDataId: Id<"nodeDatas">, xyNodeId: string];

/**
 * Résout un lot de `nodeDataId` vers leurs ids React Flow, en une passe.
 *
 * Les absents ne sont pas dans la Map rendue : un node supprimé depuis que le
 * thread l'a touché n'est plus navigable, et c'est à l'appelant d'en tirer les
 * conséquences — comme `MinimizedWindowsStack` le fait avec `existingNodeIds`.
 *
 * On ne souscrit qu'à la table des correspondances, sérialisée : pan, zoom,
 * drag et sélection ne doivent pas re-rendre l'appelant, qui est monté en
 * permanence sur le canvas. Même idiome que `MobileCanvasToolbar` et sa clé
 * d'ids sélectionnés — en JSON plutôt qu'en chaîne à séparateur, parce qu'un id
 * React Flow est une chaîne libre où n'importe quel séparateur peut se trouver.
 */
export function useNodeIdsByDataId(
  nodeDataIds: readonly Id<"nodeDatas">[],
): Map<Id<"nodeDatas">, string> {
  const pairsKey = useStore(
    useCallback((state) => {
      const pairs: NodeIdPair[] = [];
      for (const node of state.nodes) {
        const dataId = getNodeDataId(node as NodeIdentityLike);
        if (dataId) pairs.push([dataId, node.id]);
      }
      return JSON.stringify(pairs);
    }, []),
  );

  // `nodeDataIds` est un tableau neuf à chaque rendu chez la plupart des
  // appelants : on se referme sur une clé stable plutôt que sur sa référence.
  // Les ids Convex sont alphanumériques, la virgule ne peut pas s'y trouver.
  const wantedKey = nodeDataIds.join(",");

  return useMemo(() => {
    const resolved = new Map<Id<"nodeDatas">, string>();
    if (!wantedKey) return resolved;

    const wanted = new Set(wantedKey.split(","));
    for (const [dataId, xyNodeId] of JSON.parse(pairsKey) as NodeIdPair[]) {
      if (wanted.has(dataId)) resolved.set(dataId, xyNodeId);
    }
    return resolved;
  }, [pairsKey, wantedKey]);
}
