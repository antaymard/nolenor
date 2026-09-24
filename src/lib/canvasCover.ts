import {
  CANVAS_COLORS,
  type CanvasColor,
} from "@/../convex/config/colorsConfig";
import { colors } from "@/components/ui/styles";

/**
 * La couverture d'un canvas sur la home : la teinte choisie par son
 * propriétaire (`canvases.color`), ou à défaut une teinte stable tirée de son id.
 *
 * Pas de miniature réelle (il faudrait rendre le canvas), mais assez pour que
 * chaque canvas ait une identité visuelle et que la grille ne soit plus un mur
 * de cartes grises. Tirée de l'id plutôt que du nom : renommer un canvas ne doit
 * pas lui changer de couleur.
 *
 * Les teintes viennent de la palette des nodes (`src/components/ui/styles.ts`) :
 * fond pâle `lightBg`, tuile `solidBg`, assez sombre pour une initiale blanche.
 */

export type CanvasCover = {
  /** Fond de la couverture, pâle. */
  tint: string;
  /** Tuile de l'initiale, et pastille du canvas dans les listes de tâches. */
  tile: string;
};

/**
 * La couverture de chaque teinte de canvas, prise dans la palette des nodes
 * (`colors`) : la même couleur se lit pareil sur un node et sur un canvas.
 */
export const CANVAS_COVERS: Readonly<
  Record<CanvasColor, CanvasCover & { label: string }>
> = Object.fromEntries(
  CANVAS_COLORS.map((color) => [
    color,
    {
      tint: colors[color].lightBg,
      tile: colors[color].solidBg,
      label: colors[color].label,
    },
  ]),
) as Record<CanvasColor, CanvasCover & { label: string }>;

/** Couverture neutre, tant qu'un canvas n'a ni teinte choisie ni id (création). */
export const NEUTRAL_CANVAS_COVER: CanvasCover = {
  tint: "bg-slate-200",
  tile: "bg-slate-600",
};

/** Trame à pois de la couverture, en écho au fond par défaut du canvas. */
export const CANVAS_COVER_DOTS_STYLE = {
  backgroundImage:
    "radial-gradient(rgb(15 23 42 / 0.14) 1px, transparent 1.3px)",
  backgroundSize: "14px 14px",
} as const;

/** L'identité visuelle d'un canvas, telle que la renvoie `listUserCanvases`. */
export type CanvasAppearance = {
  icon?: string;
  color?: CanvasColor;
  coverImage?: { url: string; key: string };
};

export function canvasCover(
  canvasId: string,
  color?: CanvasColor,
): CanvasCover {
  if (color) return CANVAS_COVERS[color];
  let hash = 0;
  for (let i = 0; i < canvasId.length; i++) {
    hash = (hash * 31 + canvasId.charCodeAt(i)) | 0;
  }
  return CANVAS_COVERS[CANVAS_COLORS[Math.abs(hash) % CANVAS_COLORS.length]];
}

/** Ce que porte la tuile d'un canvas : son icône si elle en a une, sinon
 *  l'initiale de son nom. */
export function canvasGlyph(canvas: { name: string; icon?: string }): string {
  return canvas.icon || canvasInitial(canvas.name);
}

/** Pile de polices qui sait afficher les emoji, pour les tuiles à icône. */
export const EMOJI_FONT_STYLE = {
  fontFamily:
    '"Apple Color Emoji", "Segoe UI Emoji", NotoColorEmoji, "Noto Color Emoji", "Segoe UI Symbol", "Android Emoji", EmojiSymbols',
} as const;

/** La première lettre affichable du nom, ou un point quand il n'y en a pas. */
export function canvasInitial(name: string): string {
  const first = Array.from(name.trim())[0];
  return first ? first.toUpperCase() : "·";
}
