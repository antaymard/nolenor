/**
 * L'écart entre deux lignes qui entrent. Plafonné : sans borne, une liste de
 * vingt repères mettrait une demi-seconde à finir de se déplier.
 */
const ROW_STAGGER_MS = 25;
const MAX_STAGGER_MS = 200;

/**
 * Le fan-out d'un dossier du Dock : chaque ligne entre juste après la
 * précédente. À poser sur le conteneur de CHAQUE ligne.
 *
 * `animate-node-appear` et pas un keyframe neuf : il fait déjà scale 0.96 → 1
 * avec fade, et surtout il est déjà dans la liste d'opt-in
 * `prefers-reduced-motion` d'`index.css` — liste explicite, qu'on oublie
 * systématiquement d'alimenter quand on ajoute une animation.
 */
export function rowEnterProps(index: number): {
  className: string;
  style: { animationDelay: string };
} {
  return {
    className: "animate-node-appear",
    style: {
      animationDelay: `${Math.min(index * ROW_STAGGER_MS, MAX_STAGGER_MS)}ms`,
    },
  };
}
