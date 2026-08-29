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
