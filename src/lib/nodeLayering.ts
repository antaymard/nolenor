import type { Node } from "@xyflow/react";

/**
 * Gestion du plan (z-index) des nodes du canvas.
 *
 * React Flow n'offre qu'une prise : `node.zIndex`, qu'il pose en `style.zIndex`
 * sur le wrapper `.react-flow__node`. Aucun helper premier-plan / arrière-plan
 * n'existe dans la lib — la politique d'ordre est ici.
 *
 * On travaille en **rangs denses** : après chaque commande, les nodes sont
 * renumérotés `0..n-1`. C'est borné (pas de dérive d'entiers au fil des
 * "premier plan" successifs), auto-réparateur, et ça n'émet jamais de valeur
 * négative — un node à z négatif passerait sous les edges, qui sont à 0.
 */

export type LayerCommand = "front" | "forward" | "backward" | "back";

export type LayerUpdate = {
  nodeId: string;
  props: { zIndex: number };
};

/** Les quatre commandes, du premier plan vers l'arrière-plan. */
export const LAYER_COMMANDS: ReadonlyArray<{
  command: LayerCommand;
  label: string;
}> = [
  { command: "front", label: "Bring to front" },
  { command: "forward", label: "Bring forward" },
  { command: "backward", label: "Send backward" },
  { command: "back", label: "Send to back" },
];

/**
 * L'ordre de peinture courant, du fond (index 0) vers le premier plan.
 *
 * À `zIndex` égal, c'est l'ordre du tableau qui départage : `NodeRenderer` mappe
 * `useVisibleNodeIds()` sans jamais trier, donc l'ordre DOM suit l'ordre du
 * tableau. On reproduit exactement ce classement pour que "avancer d'un cran"
 * corresponde à ce que l'utilisateur voit.
 */
function toPaintOrder(nodes: Node[]): Node[] {
  return nodes
    .map((node, index) => ({ node, index }))
    .sort((a, b) => {
      const za = a.node.zIndex ?? 0;
      const zb = b.node.zIndex ?? 0;
      return za !== zb ? za - zb : a.index - b.index;
    })
    .map(({ node }) => node);
}

function reorder(
  ordered: Node[],
  isMoving: (node: Node) => boolean,
  command: LayerCommand,
): Node[] {
  switch (command) {
    case "front":
      return [...ordered.filter((n) => !isMoving(n)), ...ordered.filter(isMoving)];
    case "back":
      return [...ordered.filter(isMoving), ...ordered.filter((n) => !isMoving(n))];
    case "forward": {
      // Du sommet vers le fond : le sens de parcours garantit qu'un bloc
      // contigu de sélectionnés monte d'un cran **en bloc** (il ne se traverse
      // pas lui-même) et bute proprement sur le sommet.
      const next = [...ordered];
      for (let i = next.length - 2; i >= 0; i--) {
        if (isMoving(next[i]) && !isMoving(next[i + 1])) {
          [next[i], next[i + 1]] = [next[i + 1], next[i]];
        }
      }
      return next;
    }
    case "backward": {
      const next = [...ordered];
      for (let i = 1; i < next.length; i++) {
        if (isMoving(next[i]) && !isMoving(next[i - 1])) {
          [next[i], next[i - 1]] = [next[i - 1], next[i]];
        }
      }
      return next;
    }
  }
}

/**
 * Le nouveau plan des nodes sélectionnés, exprimé comme la liste **minimale**
 * des `zIndex` à écrire.
 *
 * Retourne un tableau vide quand rien ne bouge (sélection déjà au premier plan,
 * sélection vide) : l'appelant n'a alors aucune mutation à envoyer.
 */
export function computeLayerUpdates(
  nodes: Node[],
  selectedIds: Set<string>,
  command: LayerCommand,
): LayerUpdate[] {
  if (nodes.length === 0 || selectedIds.size === 0) return [];

  const isMoving = (node: Node) => selectedIds.has(node.id);
  if (!nodes.some(isMoving)) return [];

  const before = toPaintOrder(nodes);
  const after = reorder(before, isMoving, command);

  // Ordre inchangé (déjà au premier plan, canvas d'un seul node…) : on ne
  // renumérote pas. Sinon un canvas encore implicite — tous les nodes à 0,
  // départagés par l'ordre du tableau — se ferait réécrire en entier pour zéro
  // changement visible, et la sync partirait chez tous les collaborateurs.
  if (after.every((node, i) => node === before[i])) return [];

  const updates: LayerUpdate[] = [];
  after.forEach((node, zIndex) => {
    if ((node.zIndex ?? 0) === zIndex) return;
    updates.push({ nodeId: node.id, props: { zIndex } });
  });
  return updates;
}

/**
 * Le `zIndex` à donner à un node fraîchement créé pour qu'il apparaisse
 * au-dessus des autres.
 *
 * Sans ça, un nouveau node (`zIndex` absent, donc 0) atterrirait au fond de la
 * pile dès qu'une commande de plan a renuméroté le canvas — ce qui casserait le
 * "le dernier créé est au-dessus" d'aujourd'hui. La valeur peut dépasser `n-1` :
 * sans importance, la commande de plan suivante renumérote tout.
 */
export function nextTopZIndex(nodes: Node[]): number {
  let max = 0;
  for (const node of nodes) {
    const z = node.zIndex ?? 0;
    if (z > max) max = z;
  }
  return max + 1;
}
