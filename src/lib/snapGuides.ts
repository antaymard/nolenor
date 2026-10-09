/**
 * Guides d'alignement « à la Figma » pendant le déplacement de nodes.
 *
 * Fonction pure : on lui donne le rectangle qui bouge (la boîte englobante de
 * tout ce qui est traîné) et les rectangles immobiles visibles, elle rend le
 * décalage à appliquer pour coller à l'alignement le plus proche, et les
 * guides à dessiner une fois ce décalage appliqué. Tout est en coordonnées
 * monde ; le seuil aussi (le hook le dérive du zoom, pour qu'il vaille
 * quelques pixels à l'écran quel que soit le zoom).
 *
 * Deux familles d'aimants, sur chaque axe indépendamment :
 * - l'alignement : bords et centre du rectangle contre bords et centre des
 *   autres (gauche/centre/droite, haut/milieu/bas) ;
 * - l'espacement égal : se placer à mi-chemin entre deux voisins, ou
 *   prolonger une rangée avec le même écart que ses deux derniers éléments.
 *
 * Sur un axe, l'aimant le plus proche gagne ; à égalité, l'alignement passe
 * devant l'espacement.
 */

export type SnapRect = { x: number; y: number; width: number; height: number };

export type SnapAxis = "x" | "y";

/**
 * Un trait d'alignement. `axis: "x"` = trait vertical à l'abscisse `pos`,
 * tendu de `from` à `to` en ordonnée ; `axis: "y"` = l'inverse. `marks` sont
 * les points du trait où un rectangle touche l'alignement (ses deux coins sur
 * cette ligne) : les petites croix de Figma.
 */
export type AlignmentGuide = {
  axis: SnapAxis;
  pos: number;
  from: number;
  to: number;
  marks: number[];
};

/**
 * Un écart mesuré entre deux rectangles voisins. `axis: "x"` = écart
 * horizontal, segment de `start` à `end` en abscisse, à l'ordonnée `cross`.
 */
export type SpacingSegment = {
  axis: SnapAxis;
  start: number;
  end: number;
  cross: number;
};

export type SnapGuides = {
  alignments: AlignmentGuide[];
  spacings: SpacingSegment[];
};

export type SnapResult = {
  dx: number;
  dy: number;
  guides: SnapGuides;
};

/** Sous ce seuil (unités monde), deux valeurs sont tenues pour égales. */
const EPSILON = 0.5;

// Lecture d'un rectangle le long d'un axe : `start`/`size` sur l'axe,
// `crossStart`/`crossSize` sur l'autre. Permet d'écrire chaque règle une seule
// fois pour les deux axes.
type AxisSpan = {
  start: number;
  size: number;
  end: number;
  crossStart: number;
  crossEnd: number;
};

function span(rect: SnapRect, axis: SnapAxis): AxisSpan {
  return axis === "x"
    ? {
        start: rect.x,
        size: rect.width,
        end: rect.x + rect.width,
        crossStart: rect.y,
        crossEnd: rect.y + rect.height,
      }
    : {
        start: rect.y,
        size: rect.height,
        end: rect.y + rect.height,
        crossStart: rect.x,
        crossEnd: rect.x + rect.width,
      };
}

function anchors(s: AxisSpan): [number, number, number] {
  return [s.start, s.start + s.size / 2, s.end];
}

/** Les deux rectangles se recouvrent-ils sur l'axe transverse ? */
function overlapsCross(a: AxisSpan, b: AxisSpan): boolean {
  return a.crossStart < b.crossEnd && a.crossEnd > b.crossStart;
}

function crossMiddle(a: AxisSpan, b: AxisSpan): number {
  const start = Math.max(a.crossStart, b.crossStart);
  const end = Math.min(a.crossEnd, b.crossEnd);
  return (start + end) / 2;
}

type SpacingMatch = {
  /** Décalage à appliquer au rectangle mobile sur l'axe. */
  delta: number;
  /** Les écarts égaux à montrer, exprimés APRÈS décalage. */
  segments: (moved: AxisSpan) => SpacingSegment[];
};

/**
 * Les aimants d'espacement égal sur un axe. Ne considère que les voisins de
 * la même « rangée » (recouvrement sur l'axe transverse), comme Figma.
 */
function findSpacingMatches(
  moving: AxisSpan,
  others: AxisSpan[],
  axis: SnapAxis,
  threshold: number,
): SpacingMatch[] {
  const row = others.filter((other) => overlapsCross(other, moving));
  // Un voisin est « avant » s'il finit avant le début du mobile (à l'aimant
  // près : le mobile peut mordre légèrement dessus avant de se coller).
  const before = row.filter(
    (o) => o.end <= moving.start + threshold && o.start < moving.start,
  );
  const after = row.filter(
    (o) => o.start >= moving.end - threshold && o.end > moving.end,
  );
  const nearestBefore = before.reduce<AxisSpan | null>(
    (best, o) => (!best || o.end > best.end ? o : best),
    null,
  );
  const nearestAfter = after.reduce<AxisSpan | null>(
    (best, o) => (!best || o.start < best.start ? o : best),
    null,
  );

  const segment = (a: AxisSpan, b: AxisSpan): SpacingSegment => ({
    axis,
    start: a.end,
    end: b.start,
    cross: crossMiddle(a, b),
  });

  const matches: SpacingMatch[] = [];

  // Entre deux voisins : même écart de chaque côté.
  if (nearestBefore && nearestAfter) {
    const free = nearestAfter.start - nearestBefore.end - moving.size;
    if (free > 0) {
      const target = nearestBefore.end + free / 2;
      matches.push({
        delta: target - moving.start,
        segments: (moved) => [
          segment(nearestBefore, moved),
          segment(moved, nearestAfter),
        ],
      });
    }
  }

  // Prolonger une rangée vers l'aval : A [g] B [g] mobile.
  if (nearestBefore) {
    const previous = others
      .filter(
        (o) =>
          overlapsCross(o, nearestBefore) &&
          o.end <= nearestBefore.start &&
          o !== nearestBefore,
      )
      .reduce<AxisSpan | null>(
        (best, o) => (!best || o.end > best.end ? o : best),
        null,
      );
    if (previous) {
      const gap = nearestBefore.start - previous.end;
      if (gap > 0) {
        matches.push({
          delta: nearestBefore.end + gap - moving.start,
          segments: (moved) => [
            segment(previous, nearestBefore),
            segment(nearestBefore, moved),
          ],
        });
      }
    }
  }

  // Prolonger vers l'amont : mobile [g] A [g] B.
  if (nearestAfter) {
    const next = others
      .filter(
        (o) =>
          overlapsCross(o, nearestAfter) &&
          o.start >= nearestAfter.end &&
          o !== nearestAfter,
      )
      .reduce<AxisSpan | null>(
        (best, o) => (!best || o.start < best.start ? o : best),
        null,
      );
    if (next) {
      const gap = next.start - nearestAfter.end;
      if (gap > 0) {
        matches.push({
          delta: nearestAfter.start - gap - moving.end,
          segments: (moved) => [
            segment(moved, nearestAfter),
            segment(nearestAfter, next),
          ],
        });
      }
    }
  }

  return matches;
}

/** Le meilleur aimant d'alignement sur un axe, ou `null` hors seuil. */
function findAlignmentDelta(
  moving: AxisSpan,
  others: AxisSpan[],
  threshold: number,
): number | null {
  let best: number | null = null;
  const own = anchors(moving);
  for (const other of others) {
    for (const target of anchors(other)) {
      for (const anchor of own) {
        const delta = target - anchor;
        if (
          Math.abs(delta) <= threshold &&
          (best === null || Math.abs(delta) < Math.abs(best))
        ) {
          best = delta;
        }
      }
    }
  }
  return best;
}

/**
 * Les traits d'alignement visibles une fois le rectangle en place : toutes
 * les coïncidences exactes, pas seulement celle qui a aimanté (un node aligné
 * à gauche sur l'un peut l'être aussi au centre sur un autre).
 */
function collectAlignments(
  moving: AxisSpan,
  others: AxisSpan[],
  axis: SnapAxis,
): AlignmentGuide[] {
  const byPos = new Map<number, AlignmentGuide>();
  const own = anchors(moving);
  for (const other of others) {
    const theirs = anchors(other);
    for (const anchor of own) {
      if (!theirs.some((target) => Math.abs(target - anchor) < EPSILON)) {
        continue;
      }
      // Clé arrondie : deux coïncidences à un epsilon près partagent le trait.
      const key = Math.round(anchor * 10) / 10;
      const guide = byPos.get(key) ?? {
        axis,
        pos: anchor,
        from: moving.crossStart,
        to: moving.crossEnd,
        marks: [moving.crossStart, moving.crossEnd],
      };
      guide.from = Math.min(guide.from, other.crossStart);
      guide.to = Math.max(guide.to, other.crossEnd);
      guide.marks.push(other.crossStart, other.crossEnd);
      byPos.set(key, guide);
    }
  }
  return [...byPos.values()];
}

function snapAxis(
  moving: SnapRect,
  others: SnapRect[],
  axis: SnapAxis,
  threshold: number,
): { delta: number; spacing: SpacingMatch | null } {
  const movingSpan = span(moving, axis);
  const otherSpans = others.map((o) => span(o, axis));

  const alignment = findAlignmentDelta(movingSpan, otherSpans, threshold);
  const spacing = findSpacingMatches(movingSpan, otherSpans, axis, threshold)
    .filter((m) => Math.abs(m.delta) <= threshold)
    .reduce<SpacingMatch | null>(
      (best, m) =>
        !best || Math.abs(m.delta) < Math.abs(best.delta) ? m : best,
      null,
    );

  if (
    spacing &&
    (alignment === null || Math.abs(spacing.delta) < Math.abs(alignment))
  ) {
    return { delta: spacing.delta, spacing };
  }
  return { delta: alignment ?? 0, spacing: null };
}

/**
 * Calcule l'aimantation du rectangle `moving` contre `others`.
 *
 * `threshold` : distance maximale (unités monde) à laquelle un aimant attire.
 */
export function computeSnap(
  moving: SnapRect,
  others: SnapRect[],
  threshold: number,
): SnapResult {
  if (others.length === 0) {
    return { dx: 0, dy: 0, guides: { alignments: [], spacings: [] } };
  }

  // Chaque axe se décide sur la position d'avant aimantation de l'autre : les
  // rangées (recouvrement transverse) ne bougent que de quelques pixels, ça
  // ne change rien en pratique et ça garde les deux axes indépendants.
  const x = snapAxis(moving, others, "x", threshold);
  const y = snapAxis(moving, others, "y", threshold);

  const placed: SnapRect = {
    ...moving,
    x: moving.x + x.delta,
    y: moving.y + y.delta,
  };

  const alignments: AlignmentGuide[] = [];
  const spacings: SpacingSegment[] = [];
  for (const [axis, result] of [
    ["x", x],
    ["y", y],
  ] as const) {
    const placedSpan = span(placed, axis);
    const otherSpans = others.map((o) => span(o, axis));
    alignments.push(...collectAlignments(placedSpan, otherSpans, axis));
    // Sur le rectangle en place (les deux décalages appliqués) : le milieu du
    // recouvrement suit le rectangle s'il a aussi bougé sur l'autre axe.
    if (result.spacing) spacings.push(...result.spacing.segments(placedSpan));
  }

  return { dx: x.delta, dy: y.delta, guides: { alignments, spacings } };
}

/** Boîte englobante de plusieurs rectangles, `null` si vide. */
export function unionRect(rects: SnapRect[]): SnapRect | null {
  if (rects.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.width);
    maxY = Math.max(maxY, r.y + r.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
