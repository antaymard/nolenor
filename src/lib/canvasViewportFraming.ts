import type { Viewport } from "@xyflow/react";

/**
 * Le cadrage qu'un node `viewport` enregistre : un centre en coordonnées MONDE
 * et un zoom.
 *
 * React Flow travaille en `{ x, y, zoom }`, où `x`/`y` sont l'offset écran du
 * pane. Stocker ça tel quel — ce que faisaient les slideshows et les hotspots —
 * lie le cadrage à la taille de la fenêtre au moment de la capture : le même
 * enregistrement ne montre pas la même zone sur un 13" et sur un 27", et
 * redimensionner sa fenêtre décale tous ses repères. Le centre monde n'a pas ce
 * défaut, au prix d'une conversion à l'aller et au retour.
 */
/** Les dimensions du pane React Flow — un DOMRect en est un. */
export type PaneSize = { width: number; height: number };

export type ViewportFraming = {
  cx: number;
  cy: number;
  zoom: number;
};

/** Tolérances de `getFramingMatch`. */
const HERE_DISTANCE_PX = 4;
const HERE_ZOOM_RATIO_TOLERANCE = 0.015;
const NEAR_ZOOM_RATIO_MIN = 0.5;
const NEAR_ZOOM_RATIO_MAX = 2;

/** La durée d'animation utilisée par toutes les navigations du canvas. */
export const VIEWPORT_TRANSITION_MS = 500;

/**
 * Le rectangle du pane React Flow.
 *
 * Et non `window.innerWidth/Height` : le canvas vit dans `CanvasSidebar`, donc
 * le pane est plus étroit que la fenêtre dès que la sidebar est ouverte. Même
 * lookup que `toFlowPosition` (`useCanvasPointerPosition.ts`).
 */
function getPaneRect(): DOMRect | null {
  return document.querySelector(".react-flow")?.getBoundingClientRect() ?? null;
}

/**
 * Le cadrage courant, lu depuis le viewport React Flow et la taille du pane.
 *
 * `world = (écranRelatifAuPane − viewport) / zoom`, appliqué au centre du pane.
 */
export function framingFromViewport(
  viewport: Viewport,
  paneSize: PaneSize,
): ViewportFraming {
  return {
    cx: (paneSize.width / 2 - viewport.x) / viewport.zoom,
    cy: (paneSize.height / 2 - viewport.y) / viewport.zoom,
    zoom: viewport.zoom,
  };
}

/** L'inverse : `viewport = écranRelatifAuPane − world × zoom`. */
export function viewportFromFraming(
  framing: ViewportFraming,
  paneSize: PaneSize,
): Viewport {
  return {
    x: paneSize.width / 2 - framing.cx * framing.zoom,
    y: paneSize.height / 2 - framing.cy * framing.zoom,
    zoom: framing.zoom,
  };
}

/**
 * Capture le cadrage courant, ou `null` si le pane n'est pas monté.
 *
 * `getViewport` vient de `useReactFlow()` : on le passe plutôt que d'appeler le
 * hook ici, pour que cette fonction reste pure et testable.
 */
export function captureFraming(
  getViewport: () => Viewport,
): ViewportFraming | null {
  const paneRect = getPaneRect();
  if (!paneRect) return null;
  return framingFromViewport(getViewport(), paneRect);
}

/**
 * Ramène la vue sur un cadrage enregistré.
 *
 * Passe par `setViewport` et non `setCenter` : c'est l'API déjà employée par
 * toutes les navigations du canvas, et le calcul est de toute façon symétrique
 * de la capture.
 */
export function applyFraming(
  framing: ViewportFraming,
  setViewport: (viewport: Viewport, options?: { duration?: number }) => void,
  duration = VIEWPORT_TRANSITION_MS,
): void {
  const paneRect = getPaneRect();
  if (!paneRect) return;
  setViewport(viewportFromFraming(framing, paneRect), { duration });
}

export type FramingMatch = "here" | "near" | null;

/**
 * À quel point la vue courante correspond à un cadrage enregistré.
 *
 * - `here` : les centres sont à moins de 4 px écran et les zooms à 1,5 % près.
 * - `near` : le centre visé est dans le cadre courant, à un facteur 2 de zoom
 *   près — « tu y es presque », qui évite que l'indicateur clignote au moindre
 *   micro-pan.
 * - `null` : ailleurs.
 *
 * Deux hypoténuses et un ratio : appelable à chaque frame de pan pour la
 * poignée de viewport nodes d'un canvas.
 */
export function getFramingMatch(
  target: ViewportFraming,
  current: ViewportFraming,
  paneSize: PaneSize,
): FramingMatch {
  // Un zoom nul ou négatif ne peut pas venir de React Flow (minZoom 0.1), mais
  // il viendrait d'une value corrompue : la division serait alors absurde.
  if (!(target.zoom > 0) || !(current.zoom > 0)) return null;

  const dxWorld = current.cx - target.cx;
  const dyWorld = current.cy - target.cy;
  const distancePx = Math.hypot(dxWorld, dyWorld) * current.zoom;
  const zoomRatio = current.zoom / target.zoom;

  if (
    distancePx < HERE_DISTANCE_PX &&
    Math.abs(zoomRatio - 1) < HERE_ZOOM_RATIO_TOLERANCE
  ) {
    return "here";
  }

  const isTargetOnScreen =
    Math.abs(dxWorld) * current.zoom < paneSize.width / 2 &&
    Math.abs(dyWorld) * current.zoom < paneSize.height / 2;

  if (
    isTargetOnScreen &&
    zoomRatio > NEAR_ZOOM_RATIO_MIN &&
    zoomRatio < NEAR_ZOOM_RATIO_MAX
  ) {
    return "near";
  }

  return null;
}

/** Lit un `values.view` de nodeData, en tolérant une value absente ou abîmée. */
export function readFraming(value: unknown): ViewportFraming | null {
  if (typeof value !== "object" || value === null) return null;
  const { cx, cy, zoom } = value as Record<string, unknown>;
  if (
    typeof cx !== "number" ||
    typeof cy !== "number" ||
    typeof zoom !== "number" ||
    !Number.isFinite(cx) ||
    !Number.isFinite(cy) ||
    !(zoom > 0)
  ) {
    return null;
  }
  return { cx, cy, zoom };
}
