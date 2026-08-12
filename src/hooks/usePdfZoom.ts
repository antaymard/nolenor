import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useDebounce } from "@/hooks/use-debounce";

export const PDF_MIN_ZOOM = 0.5;
export const PDF_MAX_ZOOM = 4;

/** Pas des boutons − / +, calé sur une grille de multiples de 25 %. */
const ZOOM_STEP = 0.25;
/** Convertit un deltaY de molette en facteur multiplicatif (~1,1× par cran). */
const WHEEL_SENSITIVITY = 0.0008;
/** Même cadence de re-rendu que celle déjà tolérée au redimensionnement. */
const RENDER_DEBOUNCE_MS = 150;
/** Garde-fou : au-delà, on cesse de rattraper la position de lecture. */
const ANCHOR_TIMEOUT_MS = 1000;

const clampZoom = (value: number) =>
  Math.min(PDF_MAX_ZOOM, Math.max(PDF_MIN_ZOOM, value));

/** Prochain / précédent multiple de ZOOM_STEP, pour retomber sur des paliers ronds. */
const stepUp = (zoom: number) =>
  (Math.floor(zoom / ZOOM_STEP + 1e-6) + 1) * ZOOM_STEP;
const stepDown = (zoom: number) =>
  (Math.ceil(zoom / ZOOM_STEP - 1e-6) - 1) * ZOOM_STEP;

/**
 * Point de lecture à restaurer après un changement d'échelle, exprimé en
 * fraction du document — et non en pixels — pour rester valable pendant que
 * pdf.js re-rend les pages et que la hauteur totale grandit progressivement.
 */
interface PendingAnchor {
  ratioX: number;
  ratioY: number;
  focalX: number;
  focalY: number;
  /** Armé par settleAnchor au moment où la largeur change réellement. */
  expiresAt: number;
}

interface UsePdfZoomOptions {
  /** Padding horizontal total du conteneur de pages, à retrancher de la largeur utile. */
  horizontalPadding?: number;
  minBaseWidth?: number;
  maxBaseWidth?: number;
}

/**
 * Zoom d'un document PDF rendu par react-pdf.
 *
 * Le zoom agit sur la largeur passée à `<Page>` — et non sur un `transform: scale`
 * CSS — pour que pdf.js re-rastérise : le texte reste net et le défilement natif
 * est préservé, ce qui est indispensable sur un document de plusieurs dizaines de
 * pages.
 *
 * Brancher `scrollRef` sur le conteneur scrollable, et `renderWidth` sur la prop
 * `width` de chaque `<Page>`.
 */
export function usePdfZoom({
  horizontalPadding = 0,
  minBaseWidth,
  maxBaseWidth,
}: UsePdfZoomOptions = {}) {
  // Callback ref plutôt que useRef : le conteneur peut n'être monté qu'après un
  // premier rendu (données du nœud encore absentes), et les effets doivent alors
  // se rejouer.
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  const [baseWidth, setBaseWidth] = useState<number | undefined>(undefined);
  const [zoom, setZoom] = useState(1);

  const renderWidth = useDebounce(
    baseWidth === undefined ? undefined : baseWidth * zoom,
    RENDER_DEBOUNCE_MS,
  );

  const pendingAnchorRef = useRef<PendingAnchor | null>(null);
  const anchorFrameRef = useRef<number | null>(null);
  const appliedWidthRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!scrollEl) return;

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

    observer.observe(scrollEl);
    measure(scrollEl.clientWidth);

    return () => observer.disconnect();
  }, [scrollEl, horizontalPadding, minBaseWidth, maxBaseWidth]);

  const cancelAnchor = useCallback(() => {
    pendingAnchorRef.current = null;
    if (anchorFrameRef.current !== null) {
      cancelAnimationFrame(anchorFrameRef.current);
      anchorFrameRef.current = null;
    }
  }, []);

  /**
   * Rattrape la position de lecture image par image. pdf.js re-rend les pages de
   * façon asynchrone : leurs boîtes ne prennent leur nouvelle taille qu'après
   * coup, donc une position calculée en pixels au moment du commit serait clampée
   * par le navigateur. On réapplique donc la fraction cible jusqu'à ce que la
   * hauteur du document se stabilise.
   */
  const settleAnchor = useCallback((el: HTMLDivElement) => {
    const anchor = pendingAnchorRef.current;
    if (!anchor) return;

    if (anchorFrameRef.current !== null) {
      cancelAnimationFrame(anchorFrameRef.current);
    }
    anchor.expiresAt = performance.now() + ANCHOR_TIMEOUT_MS;

    let lastHeight = -1;
    let stableFrames = 0;

    const tick = () => {
      const pending = pendingAnchorRef.current;
      if (!pending) {
        anchorFrameRef.current = null;
        return;
      }

      el.scrollTop = Math.max(0, pending.ratioY * el.scrollHeight - pending.focalY);
      el.scrollLeft = Math.max(0, pending.ratioX * el.scrollWidth - pending.focalX);

      stableFrames = el.scrollHeight === lastHeight ? stableFrames + 1 : 0;
      lastHeight = el.scrollHeight;

      if (stableFrames >= 3 || performance.now() > pending.expiresAt) {
        pendingAnchorRef.current = null;
        anchorFrameRef.current = null;
        return;
      }
      anchorFrameRef.current = requestAnimationFrame(tick);
    };

    anchorFrameRef.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => cancelAnchor, [cancelAnchor]);

  const applyZoom = useCallback(
    (
      next: number | ((prev: number) => number),
      focal?: { x: number; y: number },
    ) => {
      // L'ancre doit être relevée MAINTENANT : dès que la nouvelle largeur est
      // commitée, react-pdf replie les pages en attendant leur re-rendu, la
      // hauteur du document s'effondre et le navigateur écrase scrollTop. La
      // géométrie n'est donc plus lisible dans l'effet de layout.
      if (scrollEl) {
        const point = focal ?? {
          x: scrollEl.clientWidth / 2,
          y: scrollEl.clientHeight / 2,
        };
        pendingAnchorRef.current = {
          ratioX:
            scrollEl.scrollWidth > 0
              ? (scrollEl.scrollLeft + point.x) / scrollEl.scrollWidth
              : 0,
          ratioY:
            scrollEl.scrollHeight > 0
              ? (scrollEl.scrollTop + point.y) / scrollEl.scrollHeight
              : 0,
          focalX: point.x,
          focalY: point.y,
          expiresAt: 0,
        };
      }

      setZoom((prev) =>
        clampZoom(typeof next === "function" ? next(prev) : next),
      );
    },
    [scrollEl],
  );

  // Sans ça, zoomer page 40 d'un long document renvoie page 20.
  useLayoutEffect(() => {
    const previous = appliedWidthRef.current;
    appliedWidthRef.current = renderWidth;

    if (!scrollEl || !renderWidth || !previous || previous === renderWidth) {
      return;
    }
    settleAnchor(scrollEl);
  }, [renderWidth, scrollEl, settleAnchor]);

  useEffect(() => {
    if (!scrollEl) return;

    const handleWheel = (e: WheelEvent) => {
      // Le pinch trackpad est émis par le navigateur comme un wheel + ctrlKey :
      // il emprunte donc ce même chemin.
      if (!e.ctrlKey && !e.metaKey) {
        // Défilement volontaire : on rend la main sur la position de lecture.
        cancelAnchor();
        return;
      }
      // Sans ça, c'est le zoom natif du navigateur qui se déclenche.
      e.preventDefault();

      const rect = scrollEl.getBoundingClientRect();
      applyZoom((prev) => prev * Math.exp(-e.deltaY * WHEEL_SENSITIVITY), {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    };

    // passive: false est obligatoire pour pouvoir appeler preventDefault().
    scrollEl.addEventListener("wheel", handleWheel, { passive: false });
    scrollEl.addEventListener("pointerdown", cancelAnchor);
    return () => {
      scrollEl.removeEventListener("wheel", handleWheel);
      scrollEl.removeEventListener("pointerdown", cancelAnchor);
    };
  }, [scrollEl, applyZoom, cancelAnchor]);

  const zoomIn = useCallback(() => applyZoom(stepUp), [applyZoom]);
  const zoomOut = useCallback(() => applyZoom(stepDown), [applyZoom]);
  const resetZoom = useCallback(() => applyZoom(1), [applyZoom]);

  return {
    scrollRef: setScrollEl,
    zoom,
    renderWidth,
    zoomIn,
    zoomOut,
    resetZoom,
    canZoomIn: zoom < PDF_MAX_ZOOM,
    canZoomOut: zoom > PDF_MIN_ZOOM,
  };
}
