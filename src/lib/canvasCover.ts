import type { CanvasColor } from "@/../convex/schemas/canvasesSchema";

/**
 * La couverture d'un canvas sur la home : la teinte choisie par son
 * propriétaire (`canvases.color`), ou à défaut une teinte stable tirée de son id.
 *
 * Pas de miniature réelle (il faudrait rendre le canvas), mais assez pour que
 * chaque canvas ait une identité visuelle et que la grille ne soit plus un mur
 * de cartes grises. Tirée de l'id plutôt que du nom : renommer un canvas ne doit
 * pas lui changer de couleur.
 *
 * Les classes sont écrites en entier, jamais composées : Tailwind ne génère que
 * ce qu'il lit littéralement dans le code. Les teintes de tuile sont assez
 * sombres pour porter une initiale blanche ; le violet en est absent, il dit
 * déjà « Nolë » ailleurs dans l'app.
 */

export type CanvasCover = {
  /** Fond de la couverture, pâle. */
  tint: string;
  /** Tuile de l'initiale, et pastille du canvas dans les listes de tâches. */
  tile: string;
};

/** Une entrée par clé de `CANVAS_COLORS` (convex/schemas/canvasesSchema.ts),
 *  dans le même ordre : le tirage par id en dépend. */
export const CANVAS_COVERS: Readonly<
  Record<CanvasColor, CanvasCover & { label: string }>
> = {
  blue: { tint: "bg-blue-100", tile: "bg-blue-600", label: "Blue" },
  teal: { tint: "bg-teal-100", tile: "bg-teal-700", label: "Teal" },
  orange: { tint: "bg-orange-100", tile: "bg-orange-700", label: "Orange" },
  green: { tint: "bg-green-100", tile: "bg-green-700", label: "Green" },
  pink: { tint: "bg-pink-100", tile: "bg-pink-700", label: "Pink" },
  amber: { tint: "bg-amber-100", tile: "bg-amber-700", label: "Amber" },
  sky: { tint: "bg-sky-100", tile: "bg-sky-700", label: "Sky" },
  slate: { tint: "bg-slate-200", tile: "bg-slate-600", label: "Slate" },
};

const COVERS: readonly CanvasCover[] = Object.values(CANVAS_COVERS);

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
  return COVERS[Math.abs(hash) % COVERS.length];
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
