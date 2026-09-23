/**
 * La disposition choisie pour la liste des canvas de la home : grille ou liste.
 *
 * Dans le `localStorage`, comme `welcomeStorage` : c'est une préférence
 * d'affichage propre à l'appareil, qui ne vaut ni un champ de schéma ni un
 * aller-retour réseau. Les accès sont enveloppés parce que le stockage *jette*
 * en navigation privée Safari ou quand il est bloqué — et une préférence perdue
 * retombe simplement sur la grille.
 */

export type HomeCanvasLayout = "grid" | "list";

const KEY = "nolenor:home-canvas-layout";

export function readHomeCanvasLayout(): HomeCanvasLayout {
  try {
    return window.localStorage.getItem(KEY) === "list" ? "list" : "grid";
  } catch {
    return "grid";
  }
}

export function writeHomeCanvasLayout(layout: HomeCanvasLayout): void {
  try {
    window.localStorage.setItem(KEY, layout);
  } catch {
    // Stockage indisponible — la préférence vaudra pour la session seulement.
  }
}
