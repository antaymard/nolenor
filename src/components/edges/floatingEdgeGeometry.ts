import { Position, type InternalNode } from "@xyflow/react";

/**
 * Géométrie des edges « flottantes », d'après l'exemple React Flow « Simple
 * Floating Edges » : au lieu du handle enregistré sur l'edge
 * (`${nodeId}_s{l|r|t|b}`), chaque extrémité prend en live le handle du côté
 * qui fait face à l'autre bout (centre du node opposé, ou bend point voisin).
 * Déplacer un node fait donc basculer l'edge d'un handle à l'autre.
 *
 * Les handles enregistrés restent requis par React Flow pour rendre l'edge
 * (erreur 008 sans handle correspondant) et servent de repli tant qu'un node
 * n'est pas mesuré. Ils ne décident plus du tracé.
 */

export interface FloatingPoint {
  x: number;
  y: number;
}

export interface FloatingAnchor extends FloatingPoint {
  /** Côté du handle choisi : oriente la tangente du bezier. */
  position: Position;
}

function getNodeCenter(node: InternalNode): FloatingPoint | null {
  const width = node.measured.width;
  const height = node.measured.height;
  if (!width || !height) return null;
  return {
    x: node.internals.positionAbsolute.x + width / 2,
    y: node.internals.positionAbsolute.y + height / 2,
  };
}

/**
 * Côté du node qui fait face à `toward` : l'axe où l'écart est le plus grand
 * l'emporte (même règle que `getParams` dans l'exemple React Flow).
 */
function getFacingPosition(
  center: FloatingPoint,
  toward: FloatingPoint,
): Position {
  const dx = toward.x - center.x;
  const dy = toward.y - center.y;
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0 ? Position.Right : Position.Left;
  }
  return dy > 0 ? Position.Bottom : Position.Top;
}

/**
 * Point d'accroche du handle `type` placé du côté `position`, en coordonnées
 * absolues — même calcul que `getHandlePosition` de `@xyflow/system` (bord
 * extérieur du handle), pour que le rendu ne bouge pas d'un pixel par
 * rapport aux edges rendues via leur handle enregistré.
 */
function getHandleAnchor(
  node: InternalNode,
  type: "source" | "target",
  position: Position,
): FloatingAnchor | null {
  const handle = node.internals.handleBounds?.[type]?.find(
    (h) => h.position === position,
  );
  if (!handle) return null;
  const x = node.internals.positionAbsolute.x + handle.x;
  const y = node.internals.positionAbsolute.y + handle.y;
  switch (position) {
    case Position.Top:
      return { x: x + handle.width / 2, y, position };
    case Position.Right:
      return { x: x + handle.width, y: y + handle.height / 2, position };
    case Position.Bottom:
      return { x: x + handle.width / 2, y: y + handle.height, position };
    case Position.Left:
      return { x, y: y + handle.height / 2, position };
  }
}

/**
 * Handles choisis en live pour une edge. Chaque extrémité vise le premier
 * point de passage vu de son côté : le bend point voisin s'il y en a, sinon
 * le centre du node opposé. `null` sur une extrémité = node pas encore
 * mesuré, garder le handle enregistré.
 */
export function getFloatingAnchors(
  sourceNode: InternalNode | undefined,
  targetNode: InternalNode | undefined,
  bendPoints: readonly FloatingPoint[],
): { source: FloatingAnchor | null; target: FloatingAnchor | null } {
  const sourceCenter = sourceNode ? getNodeCenter(sourceNode) : null;
  const targetCenter = targetNode ? getNodeCenter(targetNode) : null;
  if (!sourceNode || !targetNode || !sourceCenter || !targetCenter) {
    return { source: null, target: null };
  }
  const sourceToward = bendPoints[0] ?? targetCenter;
  const targetToward = bendPoints[bendPoints.length - 1] ?? sourceCenter;
  return {
    source: getHandleAnchor(
      sourceNode,
      "source",
      getFacingPosition(sourceCenter, sourceToward),
    ),
    target: getHandleAnchor(
      targetNode,
      "target",
      getFacingPosition(targetCenter, targetToward),
    ),
  };
}

/**
 * Égalité pour `useStore` : un node ne notifie ses edges que si sa géométrie
 * change (position, taille, handles re-mesurés). Sans ça, taper dans un
 * document (nouvelle `data`, donc nouvel `InternalNode`) re-rendrait toutes
 * ses edges à chaque frappe.
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
    a.measured.height === b.measured.height &&
    a.internals.handleBounds === b.internals.handleBounds
  );
}
