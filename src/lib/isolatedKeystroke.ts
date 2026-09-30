/**
 * Garde « frappe isolée » pour les raccourcis clavier NUS (une lettre, Suppr…).
 *
 * Le piège qu'elle couvre : on croit taper dans le composer de Nolë ou dans
 * un BlockNote, mais le focus est resté sur le canvas. `ignoreInputs` et le
 * store de focus ne voient alors rien d'anormal, et chaque lettre-raccourci
 * de la phrase pose un node.
 *
 * Plutôt que de deviner où l'utilisateur CROIT être, on regarde le rythme :
 * un raccourci est une frappe seule, un texte est une rafale. Une frappe
 * n'est donc retenue que si elle est entourée de silence :
 *
 * - AVANT (`QUIET_BEFORE_MS`) : aucune touche depuis un moment. Élimine les
 *   lettres au milieu et en fin de mot — y compris la dernière lettre d'une
 *   phrase, suivie d'une pause, que le seul délai « après » laisserait passer.
 * - APRÈS (`QUIET_AFTER_MS`) : aucune touche dans la foulée. Élimine la
 *   première lettre d'une phrase. L'action attend ce délai avant de partir.
 *
 * Toutes les touches comptent, modificateurs compris : Shift annonce une
 * majuscule, donc une frappe.
 */

/** Silence exigé avant la frappe. Au-dessus de l'intervalle entre deux touches d'une frappe courante. */
const QUIET_BEFORE_MS = 400;

/** Silence exigé après la frappe — et donc latence d'un raccourci retenu. */
const QUIET_AFTER_MS = 200;

// `-Infinity` : au chargement, rien n'a été tapé, la première frappe est
// silencieuse côté « avant ».
let lastKeydownAt = Number.NEGATIVE_INFINITY;
let previousKeydownAt = Number.NEGATIVE_INFINITY;
let lastKeydownEvent: KeyboardEvent | null = null;
let pendingTimer: ReturnType<typeof setTimeout> | null = null;

function cancelPending() {
  if (pendingTimer === null) return;
  clearTimeout(pendingTimer);
  pendingTimer = null;
}

/**
 * Posé en capture sur `window`, donc avant tout listener de la lib de
 * hotkeys : quand un binding s'exécute, la frappe courante est déjà
 * enregistrée, et l'action en attente d'une frappe PRÉCÉDENTE déjà annulée.
 */
function onKeyDown(event: KeyboardEvent) {
  previousKeydownAt = lastKeydownAt;
  lastKeydownAt = event.timeStamp;
  lastKeydownEvent = event;
  cancelPending();
}

// Installé à l'import et pas au premier raccourci : sans historique, la
// première lettre-raccourci d'une phrase passerait le test « avant ».
if (typeof window !== "undefined") {
  window.addEventListener("keydown", onKeyDown, { capture: true });
  import.meta.hot?.dispose(() => {
    window.removeEventListener("keydown", onKeyDown, { capture: true });
    cancelPending();
  });
}

/**
 * Vrai si aucune touche n'a été pressée dans les `QUIET_BEFORE_MS` qui
 * précèdent `event`. Suffit seul pour un geste qui doit rester immédiat
 * (Suppr) : c'est la moitié qui arrête une rafale en cours.
 */
export function hadQuietBefore(event: KeyboardEvent): boolean {
  // Le listener a normalement déjà vu `event` ; sinon (ordre inattendu),
  // `lastKeydownAt` est la frappe d'avant.
  const previous =
    lastKeydownEvent === event ? previousKeydownAt : lastKeydownAt;
  return event.timeStamp - previous >= QUIET_BEFORE_MS;
}

/**
 * Lance `action` si `event` est une frappe isolée : silence avant, et aucune
 * autre touche dans les `QUIET_AFTER_MS` qui suivent — sans quoi l'action est
 * abandonnée. Une seule action en attente à la fois.
 *
 * Tout ce qui dépend du moment de la frappe (position du pointeur…) doit être
 * lu AVANT l'appel et capturé dans `action`.
 */
export function runIfIsolatedKeystroke(
  event: KeyboardEvent,
  action: () => void,
): void {
  if (!hadQuietBefore(event)) return;
  cancelPending();
  pendingTimer = setTimeout(() => {
    pendingTimer = null;
    action();
  }, QUIET_AFTER_MS);
}
