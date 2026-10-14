/**
 * Redimensionnement d'une sélection de plusieurs nodes, comme dans Figma : un
 * seul cadre autour de la sélection, et tirer une de ses poignées met toute la
 * sélection à l'échelle — positions ET tailles — depuis le bord opposé.
 *
 * Tout est en coordonnées monde (absolues) : la conversion vers le repère
 * d'une frame ne se fait qu'à la fin, dans `scaleSelection`.
 */

export type SelectionResizeHandle =
  | "top"
  | "right"
  | "bottom"
  | "left"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

export type Rect = { x: number; y: number; width: number; height: number };
type Point = { x: number; y: number };

/**
 * Taille sous laquelle un node redimensionnable ne descend pas pendant le
 * geste. Celle du `minWidth` des titres : en dessous, plus aucun node n'est
 * lisible ni attrapable.
 */
export const SELECTION_RESIZE_MIN_NODE_SIZE = 50;

/** Un node emporté par le geste, tel qu'il était au début. */
export type ScalableNode = {
  id: string;
  parentId?: string;
  /** Coin haut gauche, en coordonnées monde. */
  absolute: Point;
  width: number;
  height: number;
  /**
   * `false` : le node suit le geste sans changer de taille (titre, node
   * compact, frame compacte…) — sa taille ne dépend pas de l'utilisateur.
   */
  scaleSize: boolean;
};

export type ScaledLayout = {
  /** Position dans le repère du parent, comme React Flow et Convex l'attendent. */
  position: Point;
  /** Absents pour un node qui ne change pas de taille. */
  width?: number;
  height?: number;
};

function directionOf(handle: SelectionResizeHandle) {
  return {
    x: handle.includes("left") ? -1 : handle.includes("right") ? 1 : 0,
    y: handle.includes("top") ? -1 : handle.includes("bottom") ? 1 : 0,
  } as const;
}

/** Le cadre englobant de rectangles en coordonnées monde. */
export function boundingRect(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const rect of rects) {
    minX = Math.min(minX, rect.x);
    minY = Math.min(minY, rect.y);
    maxX = Math.max(maxX, rect.x + rect.width);
    maxY = Math.max(maxY, rect.y + rect.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Les échelles minimales de chaque axe : aucun node redimensionnable ne doit
 * passer sous `SELECTION_RESIZE_MIN_NODE_SIZE`. Un node déjà plus petit bloque
 * le rétrécissement de son axe (échelle 1), sans pour autant le faire grandir.
 */
export function minimumScales(nodes: ScalableNode[]): Point {
  let x = 0;
  let y = 0;
  for (const node of nodes) {
    if (!node.scaleSize) continue;
    if (node.width > 0) {
      x = Math.max(x, Math.min(1, SELECTION_RESIZE_MIN_NODE_SIZE / node.width));
    }
    if (node.height > 0) {
      y = Math.max(
        y,
        Math.min(1, SELECTION_RESIZE_MIN_NODE_SIZE / node.height),
      );
    }
  }
  // Même sans node redimensionnable (que des titres), le cadre ne se
  // retourne pas et ne s'écrase pas : les nodes s'empileraient.
  return { x: Math.max(x, 0.05), y: Math.max(y, 0.05) };
}

/**
 * Le cadre de la sélection après un déplacement `delta` (monde) de la poignée.
 *
 * Le bord opposé à la poignée reste fixe. Une poignée de bord ne touche qu'un
 * axe ; avec `keepAspectRatio` (Shift), les deux axes prennent la même échelle
 * et l'autre axe grandit depuis son centre.
 */
export function resizeSelectionRect(
  start: Rect,
  handle: SelectionResizeHandle,
  delta: Point,
  {
    keepAspectRatio,
    minScale,
  }: { keepAspectRatio: boolean; minScale: Point },
): { rect: Rect; scale: Point } {
  const dir = directionOf(handle);
  let scaleX =
    dir.x !== 0 && start.width > 0
      ? (start.width + dir.x * delta.x) / start.width
      : 1;
  let scaleY =
    dir.y !== 0 && start.height > 0
      ? (start.height + dir.y * delta.y) / start.height
      : 1;

  if (keepAspectRatio) {
    // L'axe que la poignée tire le plus l'emporte ; sur un bord, c'est le
    // seul qu'elle tire.
    const uniform =
      dir.x === 0
        ? scaleY
        : dir.y === 0
          ? scaleX
          : Math.abs(scaleX - 1) >= Math.abs(scaleY - 1)
            ? scaleX
            : scaleY;
    const clamped = Math.max(uniform, minScale.x, minScale.y);
    scaleX = clamped;
    scaleY = clamped;
  } else {
    scaleX = Math.max(scaleX, minScale.x);
    scaleY = Math.max(scaleY, minScale.y);
  }

  const width = start.width * scaleX;
  const height = start.height * scaleY;
  // Bord fixe : l'opposé de la poignée, ou le centre pour l'axe qu'elle ne
  // tire pas (il ne bouge que sous Shift).
  const x =
    dir.x === -1
      ? start.x + start.width - width
      : dir.x === 1
        ? start.x
        : start.x + (start.width - width) / 2;
  const y =
    dir.y === -1
      ? start.y + start.height - height
      : dir.y === 1
        ? start.y
        : start.y + (start.height - height) / 2;

  return { rect: { x, y, width, height }, scale: { x: scaleX, y: scaleY } };
}

/**
 * Place un intervalle de taille fixe dans le nouveau cadre, à la même place
 * relative que dans l'ancien : collé à gauche il reste collé à gauche, collé
 * à droite il reste collé à droite, au milieu il reste au milieu.
 */
function placeFixed(
  start: number,
  size: number,
  from: { start: number; size: number },
  to: { start: number; size: number },
): number {
  const room = from.size - size;
  const ratio = room > 0 ? (start - from.start) / room : 0;
  return to.start + ratio * (to.size - size);
}

/**
 * Le nouvel état de chaque node, du cadre `from` au cadre `to`.
 *
 * Un node redimensionnable est mis à l'échelle, position et taille. Un node à
 * taille fixe garde sa taille et sa place relative dans le cadre.
 *
 * Les positions repassent dans le repère du parent : celui d'arrivée quand le
 * parent est lui-même emporté (frame sélectionnée), `parentAbsolute` sinon.
 */
export function scaleSelection(
  nodes: ScalableNode[],
  from: Rect,
  to: Rect,
  parentAbsolute: (parentId: string) => Point | undefined,
): Map<string, ScaledLayout> {
  const scaleX = from.width > 0 ? to.width / from.width : 1;
  const scaleY = from.height > 0 ? to.height / from.height : 1;

  const absolutes = new Map<string, Point>();
  const sizes = new Map<string, { width: number; height: number }>();
  for (const node of nodes) {
    if (node.scaleSize) {
      const width = Math.max(1, Math.round(node.width * scaleX));
      const height = Math.max(1, Math.round(node.height * scaleY));
      sizes.set(node.id, { width, height });
      absolutes.set(node.id, {
        x: to.x + (node.absolute.x - from.x) * scaleX,
        y: to.y + (node.absolute.y - from.y) * scaleY,
      });
    } else {
      absolutes.set(node.id, {
        x: placeFixed(
          node.absolute.x,
          node.width,
          { start: from.x, size: from.width },
          { start: to.x, size: to.width },
        ),
        y: placeFixed(
          node.absolute.y,
          node.height,
          { start: from.y, size: from.height },
          { start: to.y, size: to.height },
        ),
      });
    }
  }

  const layouts = new Map<string, ScaledLayout>();
  for (const node of nodes) {
    const absolute = absolutes.get(node.id)!;
    const origin = node.parentId
      ? (absolutes.get(node.parentId) ?? parentAbsolute(node.parentId))
      : undefined;
    // Arrondi APRÈS le passage au repère du parent : arrondir l'absolu puis
    // soustraire une origine fractionnaire rendrait une position fractionnaire.
    layouts.set(node.id, {
      position: {
        x: Math.round(absolute.x - (origin?.x ?? 0)),
        y: Math.round(absolute.y - (origin?.y ?? 0)),
      },
      ...sizes.get(node.id),
    });
  }
  return layouts;
}
