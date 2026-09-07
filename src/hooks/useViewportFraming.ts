import { useCallback } from "react";
import { useReactFlow, useStore, type ReactFlowState } from "@xyflow/react";
import {
  applyFraming,
  captureFraming,
  framingFromViewport,
  getFramingMatch,
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
