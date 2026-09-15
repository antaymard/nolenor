import type { InternalNode, Node } from "@xyflow/react";
import { absolutePosition } from "@/../convex/lib/nodeGeometry";

/**
 * L'appartenance d'un node à une frame, côté géométrie.
 *
 * Isolé de `useCanvasNodes` : ce sont des fonctions pures sur des rectangles,
 * et elles se relisent mieux hors du cycle de vie du drag, qui a déjà sa part
 * de subtilités.
 */

export type XY = { x: number; y: number };

function dimensionsOf(node: Node | InternalNode): XY {
  return {
    x: node.measured?.width ?? node.width ?? 0,
    y: node.measured?.height ?? node.height ?? 0,
  };
}

/**
 * La position d'un node en coordonnées MONDE.
 *
 * La règle vit dans `convex/lib/nodeGeometry`, partagée avec le backend qui en
 * a besoin pour la minimap, `list_nodes` et le placement des nodes de l'agent.
 * Ici, elle ne fait que s'appliquer à la forme `Node` de React Flow.
 */
export function absolutePositionOf(node: Node, byId: Map<string, Node>): XY {
  return absolutePosition(node, byId);
}

/** Le centre d'un node en coordonnées monde. */
export function centerOf(node: Node, byId: Map<string, Node>): XY {
  const position = absolutePositionOf(node, byId);
  const size = dimensionsOf(node);
  return { x: position.x + size.x / 2, y: position.y + size.y / 2 };
}

/**
 * La frame sous un point, la plus en avant d'abord.
 *
 * Le critère de survol est le CENTRE du node déplacé, pas son intersection :
 * c'est celui de Figma, et le seul qui ne vacille pas en cours de geste — un
 * node qui chevauche deux frames par ses bords a toujours un centre dans une
 * seule.
 *
 * « La plus en avant » se lit sur le zIndex, avec l'ordre du tableau pour
 * départager, comme partout ailleurs sur ce canvas (cf. `toPaintOrder`).
 */
export function findFrameAtPoint(
  nodes: Node[],
  point: XY,
): Node | null {
  let best: Node | null = null;
  let bestZ = -Infinity;

  for (const node of nodes) {
    if (node.type !== "frame" || node.hidden) continue;
    const size = dimensionsOf(node);
    if (
      point.x < node.position.x ||
      point.y < node.position.y ||
      point.x > node.position.x + size.x ||
      point.y > node.position.y + size.y
    ) {
      continue;
    }
    const z = node.zIndex ?? 0;
    if (z >= bestZ) {
      best = node;
      bestZ = z;
    }
  }

  return best;
}

/**
 * Le node peut-il entrer dans une frame ?
 *
 * Une frame n'entre pas dans une autre (règle produit : pas de frame dans une
 * frame), et une frame n'est évidemment pas sa propre enfant.
 */
export function canJoinFrame(node: Node): boolean {
  return node.type !== "frame";
}

/**
 * La position à écrire pour un node qui change de frame : relative à la
 * nouvelle, ou de nouveau absolue s'il n'en a plus.
 *
 * `absolute` est la position monde du node au moment du relâcher — c'est elle
 * qui est la vérité, l'appartenance ne fait que changer le repère dans lequel
 * on l'exprime.
 */
export function positionInFrame(
  absolute: XY,
  frame: Node | null,
): XY {
  if (!frame) return absolute;
  return {
    x: absolute.x - frame.position.x,
    y: absolute.y - frame.position.y,
  };
}
