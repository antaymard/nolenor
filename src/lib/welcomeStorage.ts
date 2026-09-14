/**
 * Le drapeau « a déjà vu la modale d'accueil du canvas ».
 *
 * Volontairement dans le `localStorage` et pas sur le user Convex : ça ne vaut
 * pas un aller-retour réseau ni un champ de schéma, et la conséquence d'un
 * drapeau perdu est bénigne — on revoit l'accueil une fois.
 *
 * Les deux accès sont enveloppés : `localStorage` n'est pas seulement vide en
 * navigation privée Safari ou quand le stockage du site est bloqué, il *jette*
 * à la lecture comme à l'écriture. Une modale d'accueil n'a aucune raison de
 * faire tomber un canvas.
 */

const KEY = "nolenor:canvas-welcome-seen";
const SEEN = "1";

/** `false` si le stockage est inaccessible : mieux vaut la remontrer que la perdre. */
export function hasSeenWelcome(): boolean {
  try {
    return window.localStorage.getItem(KEY) === SEEN;
  } catch {
    return false;
  }
}

/** Silencieux en cas d'échec : l'accueil se rejouera, ce n'est pas une erreur à remonter. */
export function markWelcomeSeen(): void {
  try {
    window.localStorage.setItem(KEY, SEEN);
  } catch {
    // Stockage indisponible — rien à faire de plus.
  }
}
