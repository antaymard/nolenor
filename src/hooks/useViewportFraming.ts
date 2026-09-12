import { useCallback } from "react";
import { useReactFlow, useStore, type ReactFlowState } from "@xyflow/react";
import {
  applyFraming,
  captureFraming,
  CENTERED_SCREENS,
  framingFromViewport,
  getPointDelta,
  getFramingMatch,
  resolveDeltaPoint,
  type DeltaTarget,
  type FramingDelta,
  type FramingMatch,
  type ViewportFraming,
} from "@/lib/canvasViewportFraming";

/**
 * Le côté React de `canvasViewportFraming` : capture, navigation, et
 * correspondance vive avec la vue courante.
 *
 * À appeler à l'intérieur d'un `ReactFlowProvider`.
 */

/** Capture le cadrage courant du canvas. */
export function useCaptureFraming(): () => ViewportFraming | null {
  const { getViewport } = useReactFlow();
  return useCallback(() => captureFraming(getViewport), [getViewport]);
}

/** Ramène la vue sur un cadrage enregistré, avec l'animation habituelle. */
export function useGoToFraming(): (framing: ViewportFraming) => void {
  const { setViewport } = useReactFlow();
  return useCallback(
    (framing: ViewportFraming) => applyFraming(framing, setViewport),
    [setViewport],
  );
}

/**
 * Dit si la vue courante correspond au cadrage passé.
 *
 * Passe par un sélecteur du store React Flow plutôt que par `useViewport()` :
 * ce dernier re-rendrait le composant à *chaque frame* de pan (le piège
 * documenté dans `useCanvasPointerPosition`). Ici le sélecteur tourne bien à
 * chaque frame — deux soustractions et une hypoténuse — mais il renvoie un
 * `"here" | "near" | null`, donc React ne re-rend que quand l'état change
 * vraiment, soit deux fois par navigation.
 */
export function useFramingMatch(target: ViewportFraming | null): FramingMatch {
  return useStore(
    useCallback(
      (state: ReactFlowState): FramingMatch => {
        if (!target) return null;
        const [x, y, zoom] = state.transform;
        const paneSize = { width: state.width, height: state.height };
        // Le pane n'est pas encore mesuré au premier render.
        if (paneSize.width === 0 || paneSize.height === 0) return null;

        return getFramingMatch(
          target,
          framingFromViewport({ x, y, zoom }, paneSize),
          paneSize,
        );
      },
      [target],
    ),
    Object.is,
  );
}

/**
 * Pas de quantification de l'affichage : l'égalité compare des valeurs
 * arrondies (0,1 écran, 10°, 0,1 de zoom).
 */
const SCREENS_STEP = 0.1;
const ANGLE_STEP_DEG = 10;
const ZOOM_RATIO_STEP = 0.1;

/**
 * L'égalité de `useTargetDelta` : le sélecteur reconstruit son objet à chaque
 * frame de pan, comme celui de `useFramingMatch` — mais ici la valeur est
 * continue, donc `Object.is` re-rendrait à chaque frame. On ne re-rend que
 * quand un cran visible change.
 */
function sameDelta(a: FramingDelta | null, b: FramingDelta | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const aCentered = a.screens < CENTERED_SCREENS;
  const bCentered = b.screens < CENTERED_SCREENS;
  // `zoomRatio` nul (cible node) : égalité stricte, pas de cran à comparer.
  const zoomEqual =
    a.zoomRatio === b.zoomRatio ||
    (typeof a.zoomRatio === "number" &&
      typeof b.zoomRatio === "number" &&
      Math.round(a.zoomRatio / ZOOM_RATIO_STEP) ===
        Math.round(b.zoomRatio / ZOOM_RATIO_STEP));
  return (
    a.match === b.match &&
    Math.round(a.screens / SCREENS_STEP) ===
      Math.round(b.screens / SCREENS_STEP) &&
    (aCentered || bCentered
      ? aCentered && bCentered
      : Math.round(a.angleDeg / ANGLE_STEP_DEG) ===
        Math.round(b.angleDeg / ANGLE_STEP_DEG)) &&
    zoomEqual
  );
}

/**
 * Cap + distance continus vers une cible (cadrage enregistré ou node du
 * canvas), pour l'indicateur de navigation.
 *
 * Même avertissement perf que `useFramingMatch` (sélecteur plutôt que
 * `useViewport()`), en plus strict : `sameDelta` borne les re-renders aux
 * crans visibles (0,1 écran, 10°), sinon chaque frame de pan re-rendrait
 * chaque indicateur. La résolution du centre du node lit `state.nodes` : un
 * drag du node cible déplace l'indicateur en direct, toujours borné aux
 * crans.
 */
export function useTargetDelta(
  target: DeltaTarget | null,
): FramingDelta | null {
  return useStore(
    useCallback(
      (state: ReactFlowState): FramingDelta | null => {
        if (!target) return null;
        const [x, y, zoom] = state.transform;
        const paneSize = { width: state.width, height: state.height };
        // Le pane n'est pas encore mesuré au premier render.
        if (paneSize.width === 0 || paneSize.height === 0) return null;
        // Node supprimé entre-temps : plus de point, plus d'indicateur.
        const point = resolveDeltaPoint(target, state.nodes);
        if (!point) return null;

        return getPointDelta(
          point,
          framingFromViewport({ x, y, zoom }, paneSize),
          paneSize,
          target.kind === "framing" ? target.framing.zoom : null,
        );
      },
      [target],
    ),
    sameDelta,
  );
}
