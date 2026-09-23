/**
 * La couverture d'un canvas sur la home : une teinte stable, tirée de son id.
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

const COVERS: readonly CanvasCover[] = [
  { tint: "bg-blue-100", tile: "bg-blue-600" },
  { tint: "bg-teal-100", tile: "bg-teal-700" },
  { tint: "bg-orange-100", tile: "bg-orange-700" },
  { tint: "bg-green-100", tile: "bg-green-700" },
  { tint: "bg-pink-100", tile: "bg-pink-700" },
  { tint: "bg-amber-100", tile: "bg-amber-700" },
  { tint: "bg-sky-100", tile: "bg-sky-700" },
  { tint: "bg-slate-200", tile: "bg-slate-600" },
];

/** Trame à pois de la couverture, en écho au fond par défaut du canvas. */
export const CANVAS_COVER_DOTS_STYLE = {
  backgroundImage:
    "radial-gradient(rgb(15 23 42 / 0.14) 1px, transparent 1.3px)",
  backgroundSize: "14px 14px",
} as const;

export function canvasCover(canvasId: string): CanvasCover {
  let hash = 0;
  for (let i = 0; i < canvasId.length; i++) {
    hash = (hash * 31 + canvasId.charCodeAt(i)) | 0;
  }
  return COVERS[Math.abs(hash) % COVERS.length];
}

/** La première lettre affichable du nom, ou un point quand il n'y en a pas. */
export function canvasInitial(name: string): string {
  const first = Array.from(name.trim())[0];
  return first ? first.toUpperCase() : "·";
}
