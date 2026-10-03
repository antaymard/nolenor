import type { EdgeBendPoint } from "@/types/domain";

type Delta = { x: number; y: number };

/**
 * Les bend points d'une edge quand ses extrémités bougent : translation
 * pondérée par l'index du point sur le chemin. Un point proche de la source
 * suit surtout la source, un point proche de la cible suit surtout la cible.
 *
 * Si les deux extrémités bougent du même delta, les poids se complètent
 * (w + (1 - w) = 1) et les points sont simplement translatés de ce delta.
 *
 * `base` doit être l'état d'AVANT le geste, pas l'état courant : le delta est
 * cumulé depuis l'origine du drag, l'appliquer à l'état courant le compterait
 * plusieurs fois.
 */
export function followEndpoints(
  base: readonly EdgeBendPoint[],
  sourceDelta: Delta,
  targetDelta: Delta,
): EdgeBendPoint[] {
  const count = base.length;
  return base.map((point, index) => {
    const t = (index + 1) / (count + 1);
    return {
      ...point,
      x: point.x + sourceDelta.x * (1 - t) + targetDelta.x * t,
      y: point.y + sourceDelta.y * (1 - t) + targetDelta.y * t,
    };
  });
}
