import { useEffect, type RefObject } from "react";
import { isCanvasMoving } from "@/lib/canvasPanGesture";

/**
 * Arbitre la molette entre le contenu scrollable d'un node et le canvas React Flow.
 *
 * Remplace la classe `nowheel` par un comportement sélectif :
 * - Ctrl/Meta + molette → l'événement remonte → React Flow zoome
 * - geste démarré sur l'élément → stopPropagation → le contenu scrolle, le canvas
 *   ne bouge pas
 * - geste de pan déjà en cours sur le canvas (démarré ailleurs, le curseur ne fait
 *   que survoler le node) → l'événement remonte pour que le pan continue, et le
 *   scroll interne est neutralisé
 */
export function useNoWheelUnlessZoom(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const handler = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) return;

      if (isCanvasMoving()) {
        // Pan commencé hors du node et toujours en cours : on ne le coupe pas.
        // preventDefault empêche le contenu de défiler en même temps.
        e.preventDefault();
        return;
      }

      e.stopPropagation();
    };

    // Non passif : preventDefault est nécessaire dans la branche « pan en cours ».
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [ref]);
}
