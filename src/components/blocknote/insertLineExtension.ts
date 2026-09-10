import { createExtension } from "@blocknote/core";

// Raccourcis style VSCode pour l'éditeur BlockNote :
// - Mod+Enter : insère un paragraphe vide EN DESSOUS du bloc courant,
//   sans toucher à la ligne actuelle, et y déplace le curseur.
// - Shift+Mod+Enter : même chose AU-DESSUS.
// `Mod` = Ctrl sur Win/Linux, Cmd sur Mac.
//
// Sans ça, seul Enter existe et il SPLIT le bloc au curseur : impossible
// d'ouvrir une ligne en dessous depuis le milieu d'une ligne.
//
// Type structurel minimal : l'extension est branchée sur des éditeurs de
// schémas différents (schéma app étendu + schéma par défaut des skills /
// recipes), donc on ne dépend que des 3 méthodes utilisées.
type InsertLineEditor = {
  getTextCursorPosition(): { block?: { id?: string } };
  insertBlocks(
    blocks: Array<{ type: "paragraph" }>,
    reference: string,
    placement: "before" | "after",
  ): Array<{ id?: string }>;
  setTextCursorPosition(target: string, placement: "start"): unknown;
};

function insertEmptyParagraph(
  editor: InsertLineEditor,
  placement: "before" | "after",
): boolean {
  let cursor: { block?: { id?: string } };
  try {
    cursor = editor.getTextCursorPosition();
  } catch {
    // Pas de curseur texte (sélection de node, image, ...) : on laisse
    // le comportement par défaut s'appliquer.
    return false;
  }

  const referenceId = cursor.block?.id;
  if (!referenceId) return false;

  try {
    const [inserted] = editor.insertBlocks(
      [{ type: "paragraph" }],
      referenceId,
      placement,
    );
    const insertedId = inserted?.id;
    if (!insertedId) return true;
    editor.setTextCursorPosition(insertedId, "start");
    return true;
  } catch {
    // Bloc non insérable ici (tableau exotique, colonne, ...) : on ne
    // casse rien, le raccourci est simplement ignoré.
    return false;
  }
}

export const insertLineExtension = createExtension({
  key: "insert-line-vscode",
  keyboardShortcuts: {
    "Mod-Enter": ({ editor }) =>
      insertEmptyParagraph(
        editor as unknown as InsertLineEditor,
        "after",
      ),
    "Shift-Mod-Enter": ({ editor }) =>
      insertEmptyParagraph(
        editor as unknown as InsertLineEditor,
        "before",
      ),
  },
});
