import { useEffect, useRef, type RefObject } from "react";
import { isCanvasMoving } from "@/lib/canvasPanGesture";

function handleWheel(e: WheelEvent) {
  if (e.ctrlKey || e.metaKey) return;

  if (isCanvasMoving()) {
    // Pan commencé hors du node et toujours en cours : on ne le coupe pas.
    // preventDefault empêche le contenu de défiler en même temps.
    e.preventDefault();
    return;
  }

  e.stopPropagation();
}

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
  const attachedRef = useRef<HTMLElement | null>(null);

  // Sans tableau de dépendances : l'élément peut apparaître après le premier
  // rendu (variante `title` → `preview`, état vide → contenu). Avec `[ref]`,
  // l'effet ne tournait qu'au montage et le listener n'était jamais posé sur
  // l'élément monté plus tard — la molette pannait le canvas au lieu de faire
  // défiler le node, jusqu'au rechargement de la page.
  useEffect(() => {
    const el = ref.current;
    if (attachedRef.current === el) return;
    attachedRef.current?.removeEventListener("wheel", handleWheel);
    attachedRef.current = el;
    // Non passif : preventDefault est nécessaire dans la branche « pan en cours ».
    el?.addEventListener("wheel", handleWheel, { passive: false });
  });

  useEffect(
    () => () => {
      attachedRef.current?.removeEventListener("wheel", handleWheel);
      attachedRef.current = null;
    },
    [],
  );
}
