import type { ReactZoomPanPinchContentRef } from "react-zoom-pan-pinch";

/** Marge laissée au-dessus de la page visée, en px écran. */
const TOP_GUTTER = 12;
const ANIMATION_MS = 250;

/**
 * Amène le haut de la page `pageIndex` en haut de la vue.
 *
 * Les deux vues PDF vivent sous `react-zoom-pan-pinch` : il n'y a aucun
 * conteneur scrollable, donc ni `scrollIntoView` ni `scrollTop` n'ont prise —
 * seule la translation du contenu bouge. On mesure donc à l'écran l'écart entre
 * le haut de la page et le haut de la vue, et on décale `positionY` d'autant.
 * La translation étant appliquée avant le `scale`, elle est en px écran : le
 * delta se reporte tel quel, quel que soit le zoom courant.
 *
 * Les pages sont retrouvées par leur `data-page-index` (déjà posé pour
 * l'IntersectionObserver), ce qui évite de faire circuler un tableau de refs
 * entre la vue, ses contrôles et son sommaire.
 */
export function scrollToPdfPage(
  controls: ReactZoomPanPinchContentRef | null | undefined,
  pageIndex: number,
): void {
  const wrapper = controls?.instance.wrapperComponent;
  if (!controls || !wrapper) return;

  const target = wrapper.querySelector<HTMLElement>(
    `[data-page-index="${pageIndex}"]`,
  );
  if (!target) return;

  const offset =
    target.getBoundingClientRect().top - wrapper.getBoundingClientRect().top;
  const { positionX, positionY, scale } = controls.instance.transformState;

  controls.setTransform(
    positionX,
    positionY - offset + TOP_GUTTER,
    scale,
    ANIMATION_MS,
  );
}
