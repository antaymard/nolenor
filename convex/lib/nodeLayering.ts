/**
 * Le `zIndex` d'une frame, quand deux portes en créent.
 *
 * Une frame naît autour de nodes existants : la poser au-dessus les masquerait
 * tous à l'instant même de sa création. Elle va donc SOUS tous les nodes, et
 * sous les frames déjà posées — c'est une bande à part, négative, que les nodes
 * ordinaires (`zIndex` absent, donc 0) ne touchent pas.
 *
 * Une frame créée sans `zIndex` atterrirait à 0, donc dans la bande ordinaire,
 * et son fond recouvrirait les nodes qui ne sont PAS à elle et qui traînent sous
 * sa boîte. Son propre contenu ne risque rien : React Flow peint un enfant
 * au-dessus de son parent quel que soit son `zIndex`
 * (`z: parentZ >= childZ ? parentZ + 1 : childZ`).
 *
 * Vit ici et pas seulement côté client parce que la règle a maintenant deux
 * appelants — le tracé de l'utilisateur et `group_nodes` côté agent — et qu'une
 * bande de peinture qui diverge entre les deux est invisible jusqu'au jour où un
 * node disparaît sous une frame. Même partage que `nodeGeometry`, et même
 * généricité : les deux mondes ont leur forme de node, la règle est la même.
 *
 * La dernière créée se retrouve la plus profonde. Sans conséquence tant que deux
 * frames ne se chevauchent pas — et si ça arrive, les commandes de plan
 * renumérotent la bande.
 */

export type LayeredNode = {
  type?: string;
  zIndex?: number;
};

export function frameZIndexBelow<T extends LayeredNode>(nodes: T[]): number {
  let min = 0;
  for (const node of nodes) {
    if (node.type !== "frame") continue;
    const z = node.zIndex ?? 0;
    if (z < min) min = z;
  }
  return min - 1;
}
