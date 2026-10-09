/**
 * Faire tenir le contenu d'une frame dans la frame.
 *
 * Dans la window d'une frame (cf. `FrameWindow`), rien n'empêche de lâcher un
 * node au-delà de ses bords : il resterait enfant de la frame, mais peint
 * hors de son rectangle sur le canvas. Au lieu de le bloquer, la frame
 * s'agrandit pour l'englober.
 *
 * Vers la droite et le bas, elle grandit simplement. Vers la gauche et le
 * haut, elle ne bouge pas : c'est tout son contenu qui se décale vers la
 * droite et le bas, et elle grandit d'autant. Déplacer la frame décalerait la
 * carte d'une frame compacte sur le canvas, sans raison visible pour qui la
 * regarde.
 *
 * Fonction pure, en coordonnées de la frame (celles de ses enfants).
 */

export type XY = { x: number; y: number };

export interface FitRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FrameFit {
  /** Décalage à appliquer à chaque enfant (et aux points de courbure). */
  shift: XY;
  width: number;
  height: number;
}

/** Marge laissée entre le contenu et le bord qu'il a fait reculer. */
export const FRAME_FIT_PADDING = 40;

/**
 * `null` quand tout tient déjà. Seul un enfant qui DÉPASSE fait bouger un
 * bord : un node posé contre le bord, à l'intérieur, ne déclenche rien.
 *
 * `allowShift: false` ne traite que la droite et le bas — pour les cas où
 * décaler les enfants n'est pas possible (un node pas encore confirmé par le
 * serveur ne se patche pas).
 */
export function computeFrameFit(
  frame: { width: number; height: number },
  children: FitRect[],
  {
    padding = FRAME_FIT_PADDING,
    allowShift = true,
  }: { padding?: number; allowShift?: boolean } = {},
): FrameFit | null {
  if (children.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const child of children) {
    minX = Math.min(minX, child.x);
    minY = Math.min(minY, child.y);
    maxX = Math.max(maxX, child.x + child.width);
    maxY = Math.max(maxY, child.y + child.height);
  }

  const shift = {
    x: allowShift && minX < 0 ? Math.ceil(padding - minX) : 0,
    y: allowShift && minY < 0 ? Math.ceil(padding - minY) : 0,
  };
  // Le décalage agrandit d'autant : le bord opposé ne doit pas se retrouver
  // à rogner ce qui tenait déjà.
  const shiftedMaxX = maxX + shift.x;
  const shiftedMaxY = maxY + shift.y;
  const width = Math.max(
    frame.width + shift.x,
    shiftedMaxX > frame.width + shift.x ? Math.ceil(shiftedMaxX + padding) : 0,
  );
  const height = Math.max(
    frame.height + shift.y,
    shiftedMaxY > frame.height + shift.y ? Math.ceil(shiftedMaxY + padding) : 0,
  );

  if (
    shift.x === 0 &&
    shift.y === 0 &&
    width === frame.width &&
    height === frame.height
  ) {
    return null;
  }
  return { shift, width, height };
}
