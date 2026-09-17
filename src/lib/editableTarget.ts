/**
 * Vrai quand la frappe part d'une surface de saisie : champ de recherche, input
 * du command center, chat Nolë, cellule de table, contenteditable d'un titre ou
 * d'un éditeur BlockNote.
 *
 * Tout raccourci global posé sur le canvas doit s'effacer devant ces surfaces,
 * sinon taper « t » dans un titre crée un node au lieu d'écrire une lettre.
 */
export function isEditableTarget(
  target: EventTarget | null,
): target is HTMLElement {
  return (
    target instanceof HTMLElement &&
    (target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.tagName === "SELECT" ||
      target.isContentEditable)
  );
}

/**
 * Vrai quand l'utilisateur a sélectionné du texte (historique Nolë, message,
 * cellule lue…) : un Ctrl+C doit alors laisser la copie native faire son
 * travail, jamais la détourner vers les nodes du canvas. Les surfaces de
 * saisie sont déjà couvertes par `isEditableTarget`, mais le texte statique
 * (un simple `<div>`/`<p>`) ne l'est pas — et c'est justement le cas du
 * panneau Nolë.
 */
export function hasTextSelection(): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return false;
  }
  const selection = window.getSelection();
  return !!selection && !selection.isCollapsed && selection.toString() !== "";
}
