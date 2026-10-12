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
 * Le point est le CURSEUR du drag, pas l'intersection des nodes portés : il
 * ne vacille pas en cours de geste — un point est toujours dans une seule
 * frame — et il vaut pour toute la sélection, qui entre ou sort d'un bloc.
 *
 * « La plus en avant » se lit sur le zIndex, avec l'ordre du tableau pour
 * départager, comme partout ailleurs sur ce canvas (cf. `toPaintOrder`).
 *
 * `frames` est déjà filtré par l'appelant : ce test tourne à chaque frame d'un
 * drag, il n'a pas à balayer tout le canvas pour retrouver les conteneurs.
 */
export function findFrameAtPoint(frames: Node[], point: XY): Node | null {
  let best: Node | null = null;
  let bestZ = -Infinity;

  for (const node of frames) {
    if (node.hidden) continue;
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
export function positionInFrame(absolute: XY, frame: Node | null): XY {
  if (!frame) return absolute;
  return {
    x: absolute.x - frame.position.x,
    y: absolute.y - frame.position.y,
  };
}

export type SizedRect = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * Où ranger des nodes déposés sur une frame compacte.
 *
 * Sur la carte, le point de dépôt ne dit rien de la frame dépliée : la carte
 * a sa propre taille, sans rapport avec le contenu qu'elle masque. Les nodes
 * arrivent donc SOUS le contenu existant, alignés sur son bord gauche — en
 * haut à gauche si la frame est vide —, et gardent entre eux la disposition
 * qu'ils avaient au relâcher.
 *
 * La frame grandit par la droite et le bas pour les contenir (coin haut
 * gauche fixe, comme `createNodeInFrame` côté serveur) : le contenu existant
 * ne bouge pas.
 *
 * Tout est en coordonnées de la frame. `frameSize` est sa taille STOCKÉE (la
 * dépliée), pas celle de la carte.
 */
export function placeInCompactFrame({
  incoming,
  existing,
  frameSize,
  gap,
  padding,
}: {
  incoming: SizedRect[];
  existing: SizedRect[];
  frameSize: { width: number; height: number };
  gap: number;
  padding: number;
}): {
  positions: Map<string, XY>;
  size: { width: number; height: number };
} {
  const positions = new Map<string, XY>();
  if (incoming.length === 0) return { positions, size: frameSize };

  const minX = Math.min(...incoming.map((rect) => rect.x));
  const minY = Math.min(...incoming.map((rect) => rect.y));
  const origin =
    existing.length > 0
      ? {
          x: Math.min(...existing.map((rect) => rect.x)),
          y: Math.max(...existing.map((rect) => rect.y + rect.height)) + gap,
        }
      : { x: padding, y: padding };

  let right = 0;
  let bottom = 0;
  for (const rect of incoming) {
    const x = rect.x - minX + origin.x;
    const y = rect.y - minY + origin.y;
    positions.set(rect.id, { x, y });
    right = Math.max(right, x + rect.width);
    bottom = Math.max(bottom, y + rect.height);
  }

  return {
    positions,
    size: {
      width: Math.max(frameSize.width, Math.ceil(right + padding)),
      height: Math.max(frameSize.height, Math.ceil(bottom + padding)),
    },
  };
}

/**
 * Où poser des nodes qu'on sort d'une frame : juste à sa droite, alignés sur
 * son bord haut, dans la disposition qu'ils avaient dedans.
 *
 * `frame` est le rectangle RENDU de la frame en coordonnées monde — la carte
 * pour une compacte : c'est à côté de ce qu'on voit que les nodes doivent
 * apparaître. `members` est en coordonnées de la frame ; le résultat, en
 * coordonnées monde.
 */
export function placeBesideFrame(
  frame: { x: number; y: number; width: number },
  members: SizedRect[],
  gap: number,
): Map<string, XY> {
  const positions = new Map<string, XY>();
  if (members.length === 0) return positions;
  const minX = Math.min(...members.map((rect) => rect.x));
  const minY = Math.min(...members.map((rect) => rect.y));
  const origin = { x: frame.x + frame.width + gap, y: frame.y };
  for (const rect of members) {
    positions.set(rect.id, {
      x: rect.x - minX + origin.x,
      y: rect.y - minY + origin.y,
    });
  }
  return positions;
}
