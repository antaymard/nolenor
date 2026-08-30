import { useCallback, useEffect, useRef } from "react";
import { useReactFlow, type XYPosition } from "@xyflow/react";

/**
 * La conversion écran → canvas partagée par tout ce qui pose un node à un point
 * de l'écran (drop, raccourcis de création).
 *
 * Hors du conteneur React Flow — sidebar, panneaux flottants —
 * `screenToFlowPosition` renverrait un point hors écran : on retombe alors sur
 * le centre du viewport.
 *
 * Le viewport est lu à l'appel via `getViewport()` et non via `useViewport()` :
 * s'y abonner ferait re-rendre le canvas à chaque frame de pan ou de zoom pour
 * une valeur qui ne sert qu'au moment du clic.
 *
 * Doit être appelé à l'intérieur d'un `ReactFlowProvider`.
 */
export function useFlowPosition() {
  const { screenToFlowPosition, getViewport } = useReactFlow();

  const getViewportCenter = useCallback((): XYPosition => {
    const { x, y, zoom } = getViewport();
    return {
      x: (window.innerWidth / 2 - x) / zoom,
      y: (window.innerHeight / 2 - y) / zoom,
    };
  }, [getViewport]);

  const toFlowPosition = useCallback(
    (clientX: number, clientY: number): XYPosition => {
      const pane = document.querySelector(".react-flow");
      if (pane) {
        const rect = pane.getBoundingClientRect();
        const isInsidePane =
          clientX >= rect.left &&
          clientX <= rect.right &&
          clientY >= rect.top &&
          clientY <= rect.bottom;
        if (isInsidePane) {
          return screenToFlowPosition({ x: clientX, y: clientY });
        }
      }

      return getViewportCenter();
    },
    [screenToFlowPosition, getViewportCenter],
  );

  return { toFlowPosition, getViewportCenter };
}

/**
 * La position du curseur, en coordonnées canvas.
 *
 * Rien ne suivait la souris jusqu'ici : les raccourcis de création ont besoin de
 * savoir où pointer au moment de la frappe. On garde le dernier `pointermove`
 * dans une ref — jamais dans un state, un mouvement de souris ne doit provoquer
 * aucun rendu.
 */
export function useCanvasPointerPosition() {
  const { toFlowPosition, getViewportCenter } = useFlowPosition();
  // `null` = position inconnue : le pointeur n'a pas encore bougé, ou il est
  // sorti de la fenêtre.
  const pointerRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      pointerRef.current = { x: event.clientX, y: event.clientY };
    };
    const forgetPointer = () => {
      pointerRef.current = null;
    };
    // `pointerout` ne signale une sortie de page que lorsque `relatedTarget` est
    // nul ; les passages d'un élément à l'autre en portent un.
    const onPointerOut = (event: PointerEvent) => {
      if (!event.relatedTarget) forgetPointer();
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    document.addEventListener("pointerout", onPointerOut);
    window.addEventListener("blur", forgetPointer);

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerout", onPointerOut);
      window.removeEventListener("blur", forgetPointer);
    };
  }, []);

  const getPointerFlowPosition = useCallback((): XYPosition => {
    const pointer = pointerRef.current;
    if (!pointer) return getViewportCenter();
    return toFlowPosition(pointer.x, pointer.y);
  }, [getViewportCenter, toFlowPosition]);

  return { getPointerFlowPosition };
}
