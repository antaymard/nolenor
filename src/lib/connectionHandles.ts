/**
 * Choix des handles pour une connexion posée par drag-and-drop.
 *
 * Port front de `convex/ia/tools/toolHelpers.ts` (même géométrie, mêmes ids
 * `${nodeId}_s{l|r|t|b}` / `${nodeId}_t{l|r|t|b}`, cf. `NodeHandles.tsx`) : le
 * backend reste la référence pour l'agent, ce module sert le geste manuel
 * edge → lâché dans le vide.
 *
 * Le handle source reste celui attrapé par l'utilisateur au drag — seul le
 * handle cible du nouveau node est calculé (le plus proche du point source).
 */

export type ConnectionSide = "l" | "r" | "t" | "b";

export interface ConnectionNodeRect {
  id: string;
  position: { x: number; y: number };
  width: number;
  height: number;
}

/** Repli quand un node n'a pas encore de taille mesurée. */
export const FALLBACK_NODE_WIDTH = 320;
export const FALLBACK_NODE_HEIGHT = 200;

function getSidePoint(
  rect: ConnectionNodeRect,
  side: ConnectionSide,
): { x: number; y: number } {
  const centerX = rect.position.x + rect.width / 2;
  const centerY = rect.position.y + rect.height / 2;

  switch (side) {
    case "l":
      return { x: rect.position.x, y: centerY };
    case "r":
      return { x: rect.position.x + rect.width, y: centerY };
    case "t":
      return { x: centerX, y: rect.position.y };
    case "b":
      return { x: centerX, y: rect.position.y + rect.height };
  }
}

function distanceSquared(
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

/** Extrait le côté (`l|r|t|b`) d'un id de handle source `${nodeId}_sX`. */
export function parseSourceSide(
  handleId: string | null | undefined,
): ConnectionSide | null {
  if (!handleId) return null;
  const match = handleId.match(/_s([lrbt])$/);
  const side = match?.[1];
  return side === "l" || side === "r" || side === "t" || side === "b"
    ? side
    : null;
}

/**
 * Handle cible du nouveau node, le point source restant fixe : on minimise
 * la distance point source → 4 côtés cibles.
 */
export function getBestTargetHandle({
  sourceRect,
  sourceSide,
  target,
}: {
  sourceRect: ConnectionNodeRect;
  sourceSide: ConnectionSide;
  target: ConnectionNodeRect;
}): string {
  const sourcePoint = getSidePoint(sourceRect, sourceSide);
  const sides: ConnectionSide[] = ["l", "r", "t", "b"];

  let best: { side: ConnectionSide; distance: number } | undefined;
  for (const side of sides) {
    const d2 = distanceSquared(sourcePoint, getSidePoint(target, side));
    if (!best || d2 < best.distance) {
      best = { side, distance: d2 };
    }
  }

  return `${target.id}_t${best?.side ?? "l"}`;
}

/**
 * Repli quand le handle source est inconnu : les deux côtés sont recalculés
 * (même algo 16 paires que le backend).
 */
export function getClosestHandlesForDirectedEdge({
  from,
  to,
}: {
  from: ConnectionNodeRect;
  to: ConnectionNodeRect;
}): {
  sourceHandle: string;
  targetHandle: string;
} {
  const sides: ConnectionSide[] = ["l", "r", "t", "b"];

  let best:
    | {
        sourceSide: ConnectionSide;
        targetSide: ConnectionSide;
        distance: number;
      }
    | undefined;

  for (const sourceSide of sides) {
    for (const targetSide of sides) {
      const sourcePoint = getSidePoint(from, sourceSide);
      const targetPoint = getSidePoint(to, targetSide);
      const d2 = distanceSquared(sourcePoint, targetPoint);

      if (!best || d2 < best.distance) {
        best = { sourceSide, targetSide, distance: d2 };
      }
    }
  }

  const sourceSide = best?.sourceSide ?? "r";
  const targetSide = best?.targetSide ?? "l";

  return {
    sourceHandle: `${from.id}_s${sourceSide}`,
    targetHandle: `${to.id}_t${targetSide}`,
  };
}
