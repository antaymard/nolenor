import { useCallback } from "react";
import { useReactFlow, useStore, type ReactFlowState } from "@xyflow/react";
import {
  applyFraming,
  captureFraming,
  CENTERED_SCREENS,
  framingFromViewport,
  getPointDelta,
  resolveDeltaPoint,
  type DeltaTarget,
  type FramingDelta,
  type ViewportFraming,
} from "@/lib/canvasViewportFraming";

/**
 * Le côté React de `canvasViewportFraming` : capture du cadrage courant, retour
 * à un cadrage enregistré, et cap + distance vers une cible.
 *
 * À appeler à l'intérieur d'un `ReactFlowProvider`.
 */

/** Capture le cadrage courant du canvas. */
export function useCaptureFraming(): () => ViewportFraming | null {
  const { getViewport } = useReactFlow();
  return useCallback(() => captureFraming(getViewport), [getViewport]);
}

/**
 * Ramène la vue sur un cadrage enregistré — la symétrique de
 * `useCaptureFraming`, pour les repères de navigation et tout ce qui rejoue une
 * vue capturée ailleurs.
 */
export function useApplyFraming(): (
  framing: ViewportFraming,
  duration?: number,
) => void {
  const { setViewport } = useReactFlow();
  return useCallback(
    (framing: ViewportFraming, duration?: number) =>
      applyFraming(framing, setViewport, duration),
    [setViewport],
  );
}

/**
 * Pas de quantification de l'affichage : l'égalité compare des valeurs
 * arrondies (0,1 écran, 10°).
 */
const SCREENS_STEP = 0.1;
const ANGLE_STEP_DEG = 10;

/**
 * L'égalité de `useTargetDelta` : le sélecteur reconstruit son objet à chaque
 * frame de pan, et la valeur est continue — `Object.is` re-rendrait donc à
 * chaque frame. On ne re-rend que quand un cran visible change.
 */
function sameDelta(a: FramingDelta | null, b: FramingDelta | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const aCentered = a.screens < CENTERED_SCREENS;
  const bCentered = b.screens < CENTERED_SCREENS;
  return (
    a.here === b.here &&
    Math.round(a.screens / SCREENS_STEP) ===
      Math.round(b.screens / SCREENS_STEP) &&
    (aCentered || bCentered
      ? aCentered && bCentered
      : Math.round(a.angleDeg / ANGLE_STEP_DEG) ===
        Math.round(b.angleDeg / ANGLE_STEP_DEG))
  );
}

/**
 * Cap + distance continus vers une cible du canvas (node, sélection, ou point
 * monde), pour l'indicateur de navigation.
 *
 * Passe par un sélecteur du store React Flow plutôt que par `useViewport()` :
 * ce dernier re-rendrait le composant à *chaque frame* de pan (le piège
 * documenté dans `useCanvasPointerPosition`). `sameDelta` borne en plus les
 * re-renders aux crans visibles (0,1 écran, 10°), sinon chaque frame de pan
 * re-rendrait chaque indicateur. La résolution du centre de la cible lit
 * `state.nodes` : un drag du node visé déplace l'indicateur en direct,
 * toujours borné aux crans.
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
        );
      },
      [target],
    ),
    sameDelta,
  );
}
