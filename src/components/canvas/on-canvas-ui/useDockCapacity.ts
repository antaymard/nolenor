import { useLayoutEffect, useRef, useState } from "react";

/**
 * Posé sur la barre de `CanvasToolbar` : la borne que les docks latéraux ne
 * franchissent pas.
 */
const TOOLBAR_SELECTOR = "[data-canvas-toolbar]";

/** L'air qu'on laisse entre un dock et la toolbar. */
const TOOLBAR_CLEARANCE_PX = 16;

/** La largeur d'un bouton « +N » (deux chiffres compris), gouttière en sus. */
const OVERFLOW_BUTTON_PX = 48;

/** Avant la première mesure : l'ancien plafond fixe, corrigé avant le paint. */
const DEFAULT_VISIBLE = 3;

/**
 * Combien d'éléments de largeur `itemWidth` tiennent dans `free` pixels, en
 * gardant la place du « +N » dès qu'ils ne tiennent pas tous.
 */
function fitCount(
  free: number,
  total: number,
  itemWidth: number,
  gap: number,
): number {
  const rowWidth = total * itemWidth + Math.max(0, total - 1) * gap;
  if (rowWidth <= free) return total;
  const fitting = Math.floor((free - OVERFLOW_BUTTON_PX) / (itemWidth + gap));
  return Math.max(0, Math.min(fitting, total - 1));
}

/**
 * Le nombre d'éléments qu'un dock latéral peut montrer avant de passer le
 * reste derrière un « +N » — `ActivityDock` à gauche, `MinimizedDock` à droite.
 *
 * La place se mesure entre le bord FIXE de la rangée et la toolbar du centre :
 * - `start` (gauche) : la rangée part de son bord gauche, collé au bouton
 *   Nolë, et s'arrête avant le bord gauche de la toolbar ;
 * - `end` (droite) : elle part de son bord droit, collé au bouton des repères,
 *   et s'arrête après le bord droit de la toolbar.
 * Le bord fixe ne dépend pas du contenu de la rangée : la mesure ne boucle
 * pas sur ce qu'elle décide.
 *
 * `itemWidth` est la largeur MAX d'un élément : on sous-remplit un peu quand
 * les titres sont courts, mais on ne déborde jamais sur la toolbar.
 *
 * Re-mesure quand le canvas change de taille (fenêtre, panneau latéral), quand
 * la toolbar change de largeur, et quand le voisin fixe (bouton Nolë) change
 * de largeur — via la rangée parente.
 */
export function useDockCapacity<T extends HTMLElement>({
  side,
  total,
  itemWidth,
  gap,
}: {
  side: "start" | "end";
  total: number;
  itemWidth: number;
  gap: number;
}) {
  const ref = useRef<T>(null);
  const [free, setFree] = useState<number | null>(null);
  const hasItems = total > 0;

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;

    const measure = () => {
      const rect = element.getBoundingClientRect();
      const toolbar = document
        .querySelector(TOOLBAR_SELECTOR)
        ?.getBoundingClientRect();
      // Sans toolbar (masquée, pas encore montée) : on s'arrête au milieu de
      // l'écran, là où elle serait.
      const limit = toolbar
        ? side === "start"
          ? toolbar.left
          : toolbar.right
        : window.innerWidth / 2;
      const next =
        side === "start"
          ? limit - rect.left - TOOLBAR_CLEARANCE_PX
          : rect.right - limit - TOOLBAR_CLEARANCE_PX;
      setFree(Math.max(0, Math.floor(next)));
    };

    measure();

    const observer = new ResizeObserver(measure);
    const flow = element.closest(".react-flow");
    if (flow) observer.observe(flow);
    if (element.parentElement) observer.observe(element.parentElement);
    const toolbar = document.querySelector(TOOLBAR_SELECTOR);
    if (toolbar) observer.observe(toolbar);
    window.addEventListener("resize", measure);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
    // `hasItems` : le dock ne rend rien à vide, la ref n'est attachée qu'une
    // fois qu'il y a quelque chose à montrer.
  }, [side, hasItems]);

  const visibleCount =
    free === null
      ? Math.min(total, DEFAULT_VISIBLE)
      : fitCount(free, total, itemWidth, gap);

  return { ref, visibleCount };
}
