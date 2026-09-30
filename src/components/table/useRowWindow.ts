import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { flushSync } from "react-dom";

/**
 * Plancher prudent de la hauteur d'une ligne (padding de cellule + une ligne de
 * texte) : c'est lui qui garantit que le premier rendu couvre déjà toute la
 * zone visible, avant la moindre mesure. En pratique une ligne fait 40-44 px.
 */
const MIN_ROW_PX = 24;
/** Estimation de départ des lignes pas encore rendues, avant la 1re mesure. */
const TYPICAL_ROW_PX = 41;
/** Lignes rendues d'avance sous la zone visible. */
const OVERSCAN_PX = 240;

/**
 * Le nombre de lignes à rendre dans l'aperçu d'une table, et la hauteur qui
 * tient la place des autres.
 *
 * Un node table n'en montre qu'une dizaine de lignes à la fois, mais les
 * rendait toutes : sur un canvas avec des tables de quelques centaines de
 * lignes, c'étaient des dizaines de milliers d'éléments DOM — plusieurs
 * secondes au montage du canvas, et un layout et un hit-test hors de prix à
 * chaque node qui entre à l'écran pendant un pan, à chaque mouvement de souris.
 *
 * On rend donc les lignes du haut jusqu'à couvrir la zone visible (plus une
 * marge), et une ligne vide de la hauteur estimée du reste, pour que la zone
 * défile et déborde exactement comme avant. On étend dès que le défilement en
 * approche, synchronement pour qu'aucune frame ne montre de trou, et on ne
 * réduit jamais : une table qu'on n'a pas fait défiler — la quasi-totalité,
 * puisqu'elles ne défilent qu'au survol — reste à une vingtaine de lignes.
 */
export function useRowWindow({
  enabled,
  rowCount,
  scrollContainerRef,
  tbodyRef,
  viewportHeightHint,
}: {
  enabled: boolean;
  rowCount: number;
  /** La zone qui défile (celle du node), pas la table. */
  scrollContainerRef?: RefObject<HTMLElement | null>;
  tbodyRef: RefObject<HTMLTableSectionElement | null>;
  /** Majorant de la hauteur visible : la hauteur du node. */
  viewportHeightHint: number;
}): { renderCount: number; spacerHeight: number } {
  const [renderCount, setRenderCount] = useState(() =>
    Math.ceil((viewportHeightHint + OVERSCAN_PX) / MIN_ROW_PX),
  );
  const [rowHeight, setRowHeight] = useState(TYPICAL_ROW_PX);

  // Un node agrandi doit rendre plus de lignes dès le rendu suivant, sans
  // attendre la mesure.
  const minFromHint = Math.ceil(
    (viewportHeightHint + OVERSCAN_PX) / MIN_ROW_PX,
  );
  const count = enabled
    ? Math.min(rowCount, Math.max(renderCount, minFromHint))
    : rowCount;

  const countRef = useRef(count);
  countRef.current = count;
  const rowCountRef = useRef(rowCount);
  rowCountRef.current = rowCount;

  /**
   * Mesure la hauteur réelle des lignes rendues, et étend le rendu si le
   * défilement approche de leur bas. `sync` : depuis un événement de scroll,
   * le nouveau rendu doit être peint dans la même frame.
   */
  const update = useCallback(
    (sync: boolean) => {
      const scroller = scrollContainerRef?.current;
      const tbody = tbodyRef.current;
      if (!scroller || !tbody) return;
      // Hors écran (`content-visibility: auto` de NodeFrame) : la mesure
      // forcerait le layout de la table. La zone visible est déjà couverte
      // par le plancher ; on mesurera au retour à l'écran.
      if (
        typeof scroller.checkVisibility === "function" &&
        !scroller.checkVisibility({ contentVisibilityAuto: true })
      ) {
        return;
      }
      const rendered = Math.min(countRef.current, tbody.rows.length);
      if (rendered === 0) return;
      const first = tbody.rows[0];
      const last = tbody.rows[rendered - 1];
      const renderedHeight =
        last.offsetTop + last.offsetHeight - first.offsetTop;
      const measured = renderedHeight / rendered;
      if (Math.abs(measured - rowHeight) >= 0.5) setRowHeight(measured);

      if (countRef.current >= rowCountRef.current) return;
      const table = tbody.parentElement as HTMLElement | null;
      const renderedBottom =
        (table?.offsetTop ?? 0) + last.offsetTop + last.offsetHeight;
      const needed = scroller.scrollTop + scroller.clientHeight + OVERSCAN_PX;
      if (renderedBottom >= needed) return;
      const more =
        Math.ceil((needed - renderedBottom) / Math.max(measured, MIN_ROW_PX)) +
        5;
      const grow = () =>
        setRenderCount((current) =>
          Math.min(
            rowCountRef.current,
            Math.max(current, countRef.current) + more,
          ),
        );
      if (sync) flushSync(grow);
      else grow();
    },
    [scrollContainerRef, tbodyRef, rowHeight],
  );

  useEffect(() => {
    if (!enabled) return;
    const scroller = scrollContainerRef?.current;
    const tbody = tbodyRef.current;
    if (!scroller || !tbody) return;
    const onScroll = () => update(true);
    scroller.addEventListener("scroll", onScroll, { passive: true });
    // Taille de la zone (node redimensionné) ou du contenu (édition, retour
    // à l'écran après un `content-visibility` sauté).
    const observer = new ResizeObserver(() => update(false));
    observer.observe(scroller);
    observer.observe(tbody);
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      observer.disconnect();
    };
  }, [enabled, scrollContainerRef, tbodyRef, update]);

  // Après chaque rendu (lignes filtrées, triées, éditées) : la couverture
  // peut avoir changé.
  useLayoutEffect(() => {
    if (enabled) update(false);
  });

  return {
    renderCount: count,
    spacerHeight: enabled ? Math.max(0, rowCount - count) * rowHeight : 0,
  };
}
