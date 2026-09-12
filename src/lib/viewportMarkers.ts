import type { Node } from "@xyflow/react";
import type { Id } from "@/../convex/_generated/dataModel";

/**
 * La lecture et l'ordre des repères de navigation (nodes `viewport`), au même
 * endroit pour tous ceux qui les listent : la liste partagée (`MarkerList`,
 * via un sélecteur du store React Flow) et le pont du command center
 * (`CanvasNavigatorBridge`, via `getNodes()`). Deux implémentations de l'ordre
 * finiraient par divergre, et l'encart, la fenêtre et le Ctrl+P n'afficheraient
 * plus la même chose.
 */
export type MarkerRef = {
  id: string;
  nodeDataId: Id<"nodeDatas"> | undefined;
  /** Rang explicite, absent tant que la liste n'a jamais été réordonnée. */
  order: number | undefined;
};

/**
 * Les nodes `viewport`, réduits à ce que les listes en utilisent.
 *
 * `order` vit sur le node (et non dans les `values` du nodeData) parce que
 * c'est une donnée de présentation du canvas, comme `zIndex` — et parce qu'il
 * arrive alors gratuitement ici, `node.data` faisant déjà l'aller-retour avec
 * la table `nodes` (cf. `toCanvasNode` / `fromCanvasNodeToXyNode`).
 */
export function markersFromNodes(nodes: Node[]): MarkerRef[] {
  const markers: MarkerRef[] = [];
  for (const node of nodes) {
    if (node.type !== "viewport") continue;
    const data = node.data as
      | { nodeDataId?: Id<"nodeDatas">; order?: unknown }
      | undefined;
    markers.push({
      id: node.id,
      nodeDataId: data?.nodeDataId,
      order: typeof data?.order === "number" ? data.order : undefined,
    });
  }
  return markers;
}

/**
 * Le sélecteur reconstruit son tableau à chaque passage — donc à chaque frame
 * de drag. Cette égalité borne le re-render à un vrai changement de liste :
 * ajout, suppression, réordonnancement.
 */
export function sameMarkers(a: MarkerRef[], b: MarkerRef[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (marker, index) =>
        marker.id === b[index].id &&
        marker.nodeDataId === b[index].nodeDataId &&
        marker.order === b[index].order,
    )
  );
}

/**
 * Trie les repères par rang explicite.
 *
 * Les repères sans `order` passent en fin de liste, dans leur ordre React Flow
 * courant (`sort` est stable en JS). Avant tout réordonnancement personne n'en
 * a : l'ordre affiché est donc exactement celui d'avant cette fonctionnalité —
 * zéro migration — et un repère fraîchement créé se range naturellement en
 * dernier.
 */
export function sortMarkers(markers: MarkerRef[]): MarkerRef[] {
  return markers.slice().sort((a, b) => {
    // Comparaison explicite plutôt qu'une soustraction sur des sentinelles :
    // `Infinity - Infinity` vaut `NaN`, ce qui est le cas le plus courant ici
    // (aucun repère n'a de rang avant le premier réordonnancement).
    if (a.order === b.order) return 0;
    if (a.order === undefined) return 1;
    if (b.order === undefined) return -1;
    return a.order - b.order;
  });
}
