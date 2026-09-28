import { Position, type InternalNode } from "@xyflow/react";

/**
 * Géométrie des edges « flottantes » : au lieu de partir du handle discret
 * enregistré sur l'edge (`${nodeId}_s{l|r|t|b}`), chaque extrémité se pose sur
 * le bord de son node, là où le coupe la droite qui le relie à l'autre bout
 * (centre du node opposé, ou bend point le plus proche). Le point d'accroche
 * glisse donc le long du bord quand les nodes bougent.
 *
 * Les handles restent en place côté nodes : ils servent à démarrer le geste
 * de connexion, et React Flow en a besoin pour rendre l'edge (erreur 008 sans
 * handle correspondant). Ils ne décident plus du tracé.
 */

export interface FloatingRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FloatingPoint {
  x: number;
  y: number;
}

export interface FloatingAnchor extends FloatingPoint {
  /** Côté du node touché : oriente la tangente du bezier. */
  position: Position;
}

/** Rectangle absolu d'un node, ou `null` tant qu'il n'est pas mesuré. */
export function getNodeRect(
  node: InternalNode | undefined,
): FloatingRect | null {
  const width = node?.measured.width;
  const height = node?.measured.height;
  if (!node || !width || !height) return null;
  return {
    x: node.internals.positionAbsolute.x,
    y: node.internals.positionAbsolute.y,
    width,
    height,
  };
}

export function getRectCenter(rect: FloatingRect): FloatingPoint {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

/**
 * Point où la demi-droite centre du rect → `toward` sort du rect.
 *
 * `null` quand `toward` est dans le rect (ou confondu avec son centre) : il
 * n'y a alors pas de sortie qui ait du sens — un node imbriqué dans une frame
 * reliée, deux nodes qui se chevauchent. L'appelant retombe sur le handle.
 */
export function getRectBorderAnchor(
  rect: FloatingRect,
  toward: FloatingPoint,
): FloatingAnchor | null {
  const center = getRectCenter(rect);
  const dx = toward.x - center.x;
  const dy = toward.y - center.y;
  const halfWidth = rect.width / 2;
  const halfHeight = rect.height / 2;

  // Facteur d'échelle pour atteindre chaque paire de côtés (∞ si la droite
  // leur est parallèle) : le plus petit est celui qu'on franchit en premier.
  const scaleX = dx === 0 ? Infinity : halfWidth / Math.abs(dx);
  const scaleY = dy === 0 ? Infinity : halfHeight / Math.abs(dy);
  const scale = Math.min(scaleX, scaleY);
  if (!Number.isFinite(scale) || scale >= 1) return null;

  const hitsVerticalSide = scaleX <= scaleY;
  return {
    x: center.x + dx * scale,
    y: center.y + dy * scale,
    position: hitsVerticalSide
      ? dx > 0
        ? Position.Right
        : Position.Left
      : dy > 0
        ? Position.Bottom
        : Position.Top,
  };
}

/**
 * Points d'accroche flottants d'une edge. Chaque extrémité vise le premier
 * point de passage vu de son côté : le bend point voisin s'il y en a, sinon
 * le centre du node opposé. `null` sur une extrémité = pas de point
 * flottant, garder celui du handle.
 */
export function getFloatingAnchors(
  sourceRect: FloatingRect,
  targetRect: FloatingRect,
  bendPoints: readonly FloatingPoint[],
): { source: FloatingAnchor | null; target: FloatingAnchor | null } {
  const sourceToward = bendPoints[0] ?? getRectCenter(targetRect);
  const targetToward =
    bendPoints[bendPoints.length - 1] ?? getRectCenter(sourceRect);
  return {
    source: getRectBorderAnchor(sourceRect, sourceToward),
    target: getRectBorderAnchor(targetRect, targetToward),
  };
}

/**
 * Égalité pour `useStore` : un node ne notifie ses edges que si sa géométrie
 * change. Sans ça, taper dans un document (nouvelle `data`, donc nouvel
 * `InternalNode`) re-rendrait toutes ses edges à chaque frappe.
 */
export function isSameNodeGeometry(
  a: InternalNode | undefined,
  b: InternalNode | undefined,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.internals.positionAbsolute.x === b.internals.positionAbsolute.x &&
    a.internals.positionAbsolute.y === b.internals.positionAbsolute.y &&
    a.measured.width === b.measured.width &&
    a.measured.height === b.measured.height
  );
}
