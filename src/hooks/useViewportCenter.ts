import { useCallback } from "react";
import { useReactFlow, type XYPosition } from "@xyflow/react";

/**
 * Le centre du viewport courant, en coordonnées canvas.
 *
 * Rend un callback et non une valeur, et lit le viewport via `getViewport()`
 * plutôt que `useViewport()` : les appelants (coller, déposer, créer depuis la
 * toolbar) n'ont besoin de la position qu'au moment du geste, alors que
 * `useViewport()` abonne le composant au store et le re-rend **à chaque frame
 * de pan et de zoom**. Dans `CanvasFlow`, cet abonnement re-rendait tout
 * `<ReactFlow>` par frame — et comme un rendu de `<ReactFlow>` repousse ses
 * props dans le store, chaque frame déclenchait une seconde notification.
 *
 * `useReactFlow()` rend un objet mémoïsé : le callback est stable, donc les
 * `useEffect` qui posent des listeners `window` ne se réenregistrent plus.
 * Même lecture ponctuelle que `useNoleChat` fait déjà à l'envoi d'un message.
 */
export function useViewportCenter(): () => XYPosition {
  const { getViewport } = useReactFlow();

  return useCallback(() => {
    const { x, y, zoom } = getViewport();
    return {
      x: (window.innerWidth / 2 - x) / zoom,
      y: (window.innerHeight / 2 - y) / zoom,
    };
  }, [getViewport]);
}
