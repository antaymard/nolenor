/**
 * Neutralise le zoom natif du navigateur sur toute l'app.
 *
 * Une app canvas a son propre zoom : celui du navigateur ne fait que casser le
 * layout. React Flow neutralise déjà le geste sur `.react-flow__renderer`, mais
 * tout ce qui passe à côté — panneaux, modales, windows, iframes — tombait sur
 * le zoom de page.
 *
 * On ne bloque que le **geste** : pinch trackpad, ctrl/⌘ + molette, gestes
 * WebKit. `Cmd/Ctrl` + `+`/`-`/`0` reste délibéré côté utilisateur et sert
 * d'aide d'accessibilité — aucun listener clavier ici.
 *
 * Pendant du couple `globalErrorHandlers.ts` : même motif « installé une fois
 * depuis `main.tsx`, avant le premier render ».
 */

/**
 * `gesturestart`/`gesturechange`/`gestureend` sont propres à WebKit et absents
 * de `WindowEventMap` ; le handler n'a besoin que de `preventDefault`.
 */
const GESTURE_EVENTS = ["gesturestart", "gesturechange", "gestureend"] as const;

/**
 * Non passif : Chrome force `passive: true` par défaut sur `wheel` au niveau
 * de `window`, et un `preventDefault` passif est ignoré en silence.
 * Capture : c'est la seule phase qui se déclenche à coup sûr, même si un
 * handler intermédiaire arrête la propagation.
 */
const LISTENER_OPTIONS: AddEventListenerOptions = { passive: false, capture: true };

function preventZoomWheel(event: WheelEvent) {
  // Un pinch trackpad est livré comme un wheel avec `ctrlKey` synthétique :
  // c'est le même test qui couvre le geste et le vrai ctrl/⌘ + molette.
  if (!event.ctrlKey && !event.metaKey) return;

  // Surtout pas de `stopPropagation` : l'événement doit continuer sa route
  // jusqu'à React Flow (zoom du canvas) et jusqu'à react-zoom-pan-pinch (zoom
  // des vues PDF/image). On lui retire seulement son effet navigateur.
  event.preventDefault();
}

function preventZoomGesture(event: Event) {
  event.preventDefault();
}

let installed = false;

/** Arme le garde et renvoie son teardown. */
export function installBrowserZoomGuard(): () => void {
  if (installed) return () => {};
  installed = true;

  window.addEventListener("wheel", preventZoomWheel, LISTENER_OPTIONS);
  for (const type of GESTURE_EVENTS) {
    window.addEventListener(type, preventZoomGesture, LISTENER_OPTIONS);
  }

  return () => {
    window.removeEventListener("wheel", preventZoomWheel, LISTENER_OPTIONS);
    for (const type of GESTURE_EVENTS) {
      window.removeEventListener(type, preventZoomGesture, LISTENER_OPTIONS);
    }
    installed = false;
  };
}

/**
 * Jumeau du garde ci-dessus, injecté dans le srcdoc des AppNode.
 *
 * Ces iframes sont en `sandbox="allow-scripts"` sans `allow-same-origin` :
 * origine opaque, donc un `wheel` né chez elles n'atteint jamais notre document
 * et `installBrowserZoomGuard` ne peut structurellement rien pour elles. C'est
 * la seule iframe dont on possède le document, donc la seule qu'on puisse armer
 * de l'intérieur.
 *
 * Duplication assumée — même parti pris que `globalErrorHandlers` ↔
 * `buildSrcdoc` : le code traverse une frontière de document, il ne peut pas
 * être importé. On le garde ici, à vingt lignes de son jumeau, plutôt que dans
 * `buildSrcdoc.ts` : c'est la seule protection réelle contre la dérive.
 */
export const IFRAME_ZOOM_GUARD_SNIPPET = `
    (function () {
      // Capture : le code utilisateur peut poser son propre handler wheel.
      var options = { passive: false, capture: true };
      window.addEventListener("wheel", function (event) {
        if (!event.ctrlKey && !event.metaKey) return;
        event.preventDefault();
      }, options);
      ["gesturestart", "gesturechange", "gestureend"].forEach(function (type) {
        window.addEventListener(type, function (event) {
          event.preventDefault();
        }, options);
      });
    })();`;
