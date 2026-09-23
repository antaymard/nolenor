/**
 * Le panneau du dock (repères et windows minimisées) était-il déplié ?
 *
 * Seule l'ouverture à la main est retenue : celle que déclenche une
 * minimisation est de l'état de session, la rejouer au chargement alors
 * qu'aucune window n'est minimisée n'aurait aucun sens.
 *
 * Une clé unique pour TOUS les canvas, et pas une par canvas : c'est une
 * préférence d'espace de travail (« je veux voir mes repères »), pas une
 * propriété du canvas ouvert. Le remettre en question à chaque changement de
 * canvas serait le contraire de ce qu'on veut.
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
