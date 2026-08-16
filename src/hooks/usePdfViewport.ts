import { useEffect, useState } from "react";

interface UsePdfViewportOptions {
  /** Nombre de pages montées : sert à ré-observer quand elles apparaissent. */
  numPages: number;
  /** Padding horizontal total du conteneur de pages, à retrancher de la largeur utile. */
  horizontalPadding?: number;
  minBaseWidth?: number;
  maxBaseWidth?: number;
}

const EMPTY_PAGES: ReadonlySet<number> = new Set();

/**
 * Géométrie partagée par les deux vues PDF : largeur de rendu « ajusté à la
 * largeur », et pages actuellement à l'écran.
 *
 * La visibilité n'est pas un détail de confort : le zoom se fait par
 * `transform: scale()` et la netteté est rattrapée en montant `devicePixelRatio`
 * sur `<Page>`. Comme react-pdf ne virtualise rien, appliquer ce ratio à toutes
 * les pages ferait exploser la mémoire canvas (surface × ratio²) sur un document
 * long. On ne le monte donc que sur les pages visibles.
 *
 * Brancher `viewportRef` sur le conteneur qui découpe la vue — c'est à la fois
 * l'élément mesuré et la racine de l'IntersectionObserver.
 */
export function usePdfViewport({
  numPages,
  horizontalPadding = 0,
  minBaseWidth,
  maxBaseWidth,
}: UsePdfViewportOptions) {
  const [viewportEl, setViewportEl] = useState<HTMLElement | null>(null);
  const [baseWidth, setBaseWidth] = useState<number | undefined>(undefined);
  const [visiblePages, setVisiblePages] =
    useState<ReadonlySet<number>>(EMPTY_PAGES);

  useEffect(() => {
    if (!viewportEl) return;

    const measure = (width: number) => {
      // Une fenêtre minimisée passe en display:none et mesure 0 : on l'ignore
      // pour ne pas rendre les pages à une largeur nulle.
      const available = width - horizontalPadding;
      if (available <= 0) return;

      let next = available;
      if (maxBaseWidth !== undefined) next = Math.min(next, maxBaseWidth);
      if (minBaseWidth !== undefined) next = Math.max(next, minBaseWidth);

      setBaseWidth((prev) =>
        prev !== undefined && Math.abs(prev - next) < 1 ? prev : next,
      );
    };

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) measure(entry.contentRect.width);
    });

    observer.observe(viewportEl);
    measure(viewportEl.clientWidth);

    return () => observer.disconnect();
  }, [viewportEl, horizontalPadding, minBaseWidth, maxBaseWidth]);

  useEffect(() => {
    if (!viewportEl || numPages === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        setVisiblePages((prev) => {
          const next = new Set(prev);
          let changed = false;
          for (const entry of entries) {
            const index = Number(
              (entry.target as HTMLElement).dataset.pageIndex,
            );
            if (Number.isNaN(index)) continue;
            if (entry.isIntersecting && !next.has(index)) {
              next.add(index);
              changed = true;
            } else if (!entry.isIntersecting && next.has(index)) {
              next.delete(index);
              changed = true;
            }
          }
          return changed ? next : prev;
        });
      },
      // Marge généreuse : les pages voisines sont prêtes avant d'entrer à l'écran.
      { root: viewportEl, rootMargin: "200px" },
    );

    viewportEl
      .querySelectorAll("[data-page-index]")
      .forEach((node) => observer.observe(node));

    return () => observer.disconnect();
  }, [viewportEl, numPages]);

  return { viewportRef: setViewportEl, baseWidth, visiblePages };
}
