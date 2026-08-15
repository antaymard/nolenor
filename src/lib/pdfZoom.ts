export const PDF_MIN_ZOOM = 0.5;
export const PDF_MAX_ZOOM = 4;
/** Pas des boutons − / +. */
export const PDF_ZOOM_STEP = 0.25;

/**
 * Plafond de densité de rendu. Le zoom se faisant par transform CSS, la netteté
 * vient de `devicePixelRatio` sur `<Page>` — mais la surface du canvas croît en
 * ratio², et les navigateurs plafonnent taille et mémoire des canvas (iOS Safari
 * est le plus strict). On borne donc la densité plutôt que de suivre le zoom
 * jusqu'à 400 %.
 */
const MAX_PIXEL_RATIO = 4;

/** En deçà, la densité native suffit : inutile de re-rendre le canvas. */
const SHARPEN_FROM = 1.2;

/**
 * Arrondit l'échelle à un palier de 0,5. Le zoom est fluide (transform CSS), mais
 * on ne veut re-rendre les canvas qu'à des seuils utiles — pas à chaque frame.
 */
export function pdfRenderScale(scale: number): number {
  return Math.min(Math.round(scale * 2) / 2, PDF_MAX_ZOOM);
}

/**
 * Densité de rendu d'une page pour un niveau de zoom donné. Ne monte que pour les
 * pages visibles, sans quoi la mémoire canvas exploserait sur un document long
 * (react-pdf monte toutes les pages, il n'en virtualise aucune).
 */
export function pdfPixelRatio(scale: number, isVisible: boolean): number {
  const base = typeof window === "undefined" ? 1 : window.devicePixelRatio;
  if (!isVisible || scale < SHARPEN_FROM) return base;
  return Math.min(scale * base, MAX_PIXEL_RATIO);
}
