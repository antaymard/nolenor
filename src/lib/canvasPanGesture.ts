/**
 * Suivi du geste de pan/zoom du canvas, hors de React (aucun re-render).
 *
 * Un wheel event ne dit pas s'il ouvre un geste ou s'il en continue un. Les nodes
 * qui capturent la molette (cf. `useNoWheelUnlessZoom`) ont besoin de savoir si le
 * canvas est déjà en train de bouger : dans ce cas ils laissent passer l'événement
 * au lieu de couper le pan en cours.
 *
 * On repart d'un timestamp rafraîchi par `<ReactFlow onMove>` plutôt que d'un
 * booléen `onMoveStart`/`onMoveEnd` : un `onMoveEnd` manquant laisserait un booléen
 * coincé à `true` et casserait définitivement le scroll interne des nodes, alors
 * qu'un timestamp se périme tout seul.
 */

/** Au-delà de ce délai sans mouvement du viewport, le geste est considéré terminé. */
const PAN_GESTURE_IDLE_MS = 200;

let lastMoveAt = 0;

/** À brancher sur `<ReactFlow onMove>` : appelé à chaque pas de pan/zoom. */
export function markCanvasMoved() {
  lastMoveAt = performance.now();
}

/** Vrai tant qu'un geste de pan/zoom du canvas est encore en cours. */
export function isCanvasMoving() {
  return performance.now() - lastMoveAt < PAN_GESTURE_IDLE_MS;
}
