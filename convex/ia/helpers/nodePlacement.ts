// Placement géométrique des nouveaux nodes (create_node).
//
// Module PUR : aucun import — ni Convex, ni zod — pour rester exécutable et
// vérifiable hors runtime (node type stripping). Les rectangles acceptés
// sont structurellement compatibles avec le `NodeRect` de toolHelpers et
// le DTO CanvasNode (position/width/height).

export type PlacementSide = "left" | "right" | "above" | "below";
export type PlacementRequest = PlacementSide | "auto";

export type PlacementRect = {
  position: { x: number; y: number };
  width: number;
  height: number;
};

/** Ordre de préférence du placement "auto" : sens de lecture occidental. */
const AUTO_PLACEMENT_ORDER: PlacementSide[] = ["right", "below", "left", "above"];

/** Respiration entre l'ancre et le nouveau node, pour laisser passer les edges. */
const SIDE_GAP_X = 80;
const SIDE_GAP_Y = 60;
/** Marge exigée autour des nodes existants (même valeur que windowsStore). */
const OVERLAP_PADDING = 24;
/** Pas de la grille de scan autour de l'ancre. */
const SCAN_STEP = 160;
/** Borné : le scan rend toujours un candidat, quitte à tolérer l'overlap. */
const SCAN_MAX_RINGS = 4;

function rectsOverlap(a: PlacementRect, b: PlacementRect): boolean {
  return !(
    a.position.x + a.width + OVERLAP_PADDING <= b.position.x ||
    a.position.x >= b.position.x + b.width + OVERLAP_PADDING ||
    a.position.y + a.height + OVERLAP_PADDING <= b.position.y ||
    a.position.y >= b.position.y + b.height + OVERLAP_PADDING
  );
}

function candidateRect(
  position: { x: number; y: number },
  size: { width: number; height: number },
): PlacementRect {
  return { position, width: size.width, height: size.height };
}

function overlapsAny(
  position: { x: number; y: number },
  size: { width: number; height: number },
  obstacles: PlacementRect[],
): boolean {
  const candidate = candidateRect(position, size);
  return obstacles.some((obstacle) => rectsOverlap(candidate, obstacle));
}

function sideCandidate(
  anchor: PlacementRect,
  side: PlacementSide,
  size: { width: number; height: number },
): { x: number; y: number } {
  const centerX = anchor.position.x + anchor.width / 2;
  const centerY = anchor.position.y + anchor.height / 2;

  switch (side) {
    case "right":
      return {
        x: anchor.position.x + anchor.width + SIDE_GAP_X,
        y: centerY - size.height / 2,
      };
    case "left":
      return {
        x: anchor.position.x - SIDE_GAP_X - size.width,
        y: centerY - size.height / 2,
      };
    case "below":
      return {
        x: centerX - size.width / 2,
        y: anchor.position.y + anchor.height + SIDE_GAP_Y,
      };
    case "above":
      return {
        x: centerX - size.width / 2,
        y: anchor.position.y - SIDE_GAP_Y - size.height,
      };
  }
}

/**
 * Rectangle englobant du contenu existant — ancre de repli quand l'agent ne
 * donne ni ancre ni sources : le node atterrit au bord du contenu (côté
 * demandé, "right" par défaut) plutôt qu'au milieu d'un amas.
 */
export function contentAnchor(nodes: PlacementRect[]): PlacementRect | null {
  if (nodes.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of nodes) {
    minX = Math.min(minX, node.position.x);
    minY = Math.min(minY, node.position.y);
    maxX = Math.max(maxX, node.position.x + node.width);
    maxY = Math.max(maxY, node.position.y + node.height);
  }

  return {
    position: { x: minX, y: minY },
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * Place un node relativement à une ancre, sans recouvrir les obstacles.
 *
 * 1. Candidat à côté de l'ancre (côté demandé, sinon l'ordre auto
 *    right → below → left → above), aligné au centre sur l'axe perpendiculaire.
 * 2. Scan en anneaux autour du candidat du premier côté (grille de
 *    SCAN_STEP, bornée à SCAN_MAX_RINGS) — les placements s'empilent en
 *    colonne le long du côté demandé.
 * 3. Dernier recours : le candidat du premier côté, même s'il overlappe —
 *    le placement n'échoue jamais la création.
 */
export function resolveRelativePlacement({
  anchor,
  size,
  placement,
  obstacles,
}: {
  anchor: PlacementRect;
  size: { width: number; height: number };
  placement: PlacementRequest;
  obstacles: PlacementRect[];
}): { x: number; y: number; applied: PlacementSide | "scan" } {
  const sides: PlacementSide[] =
    placement === "auto" ? AUTO_PLACEMENT_ORDER : [placement];

  // Le candidat du premier côté sert aussi d'origine du scan : occupé, la
  // recherche continue autour de LUI (empilement en colonne le long du côté
  // demandé), pas autour de l'ancre.
  const primary = sideCandidate(anchor, sides[0], size);
  for (const side of sides) {
    const candidate = sideCandidate(anchor, side, size);
    if (!overlapsAny(candidate, size, obstacles)) {
      return { ...candidate, applied: side };
    }
  }

  for (let ring = 1; ring <= SCAN_MAX_RINGS; ring++) {
    for (let j = -ring; j <= ring; j++) {
      for (let i = -ring; i <= ring; i++) {
        if (Math.max(Math.abs(i), Math.abs(j)) !== ring) continue;
        const candidate = {
          x: primary.x + i * SCAN_STEP,
          y: primary.y + j * SCAN_STEP,
        };
        if (!overlapsAny(candidate, size, obstacles)) {
          return { ...candidate, applied: "scan" };
        }
      }
    }
  }

  return { ...primary, applied: sides[0] };
}
