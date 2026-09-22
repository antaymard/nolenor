/**
 * L'état ouvert/replié du dock des repères.
 *
 * Une clé unique pour TOUS les canvas, et pas une par canvas : le dock est une
 * préférence d'espace de travail (« je veux voir mes repères »), pas une
 * propriété du canvas ouvert. Le rouvrir à chaque changement de canvas serait
 * le remettre en question à chaque fois.
 *
 * Dans le `localStorage` et pas sur le user Convex, pour la même raison que
 * `welcomeStorage` : ça ne vaut ni un aller-retour réseau ni un champ de
 * schéma, et un drapeau perdu ne coûte qu'un clic.
 *
 * Les deux accès sont enveloppés : `localStorage` n'est pas seulement vide en
 * navigation privée Safari ou quand le stockage du site est bloqué, il *jette*
 * à la lecture comme à l'écriture.
 */

const KEY = "nolenor:bookmarks-dock-open";
const OPEN = "1";

/** `false` si le stockage est inaccessible : le dock démarre replié. */
export function isBookmarksDockOpen(): boolean {
  try {
    return window.localStorage.getItem(KEY) === OPEN;
  } catch {
    return false;
  }
}

/** Silencieux en cas d'échec : le dock reste ouvert pour la session, sans plus. */
export function setBookmarksDockOpen(open: boolean): void {
  try {
    window.localStorage.setItem(KEY, open ? OPEN : "0");
  } catch {
    // Stockage indisponible — rien à faire de plus.
  }
}
