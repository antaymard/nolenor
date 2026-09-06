// Conversions de la cellule `richtext` d'un node table.
//
// Une cellule rich text stocke un document BlockNote sérialisé — la même
// convention que `nodeDatas.values.doc` et que le champ `rich_text` des custom
// nodes. Tout ce qui doit la relire comme du texte passe par ici : export CSV et
// Markdown côté client, formatage pour l'agent et indexation full-text côté
// serveur, écriture par les tools de table.
//
// Placé dans `convex/lib` parce que les deux côtés en ont besoin et que le
// frontend importe déjà ce dossier (cf. `@/../convex/lib/blockNoteDocument`).
// Pur, sans DOM ni dépendance BlockNote, comme son voisin.

import {
  extractInlineText,
  generateBlockId,
  parseNonEmptyBlockNoteDocument,
  stringifyBlockNoteDocumentForStorage,
  type BlockNoteBlock,
} from "./blockNoteDocument";

export { parseNonEmptyBlockNoteDocument as parseRichTextCell };

/**
 * Aplatit un document en texte brut, un bloc par ligne.
 *
 * Les blocs vides comptent pour une ligne vide : `richTextFromPlainText` les
 * conserve à l'aller, les jeter au retour cassait l'aller-retour et faisait
 * disparaître les sauts de paragraphe de l'export et de la vue de l'agent.
 * Les lignes vides de queue sont en revanche taillées, pour qu'un document
 * vide reste la chaîne vide.
 */
export function richTextToPlainText(value: unknown): string {
  const blocks = parseNonEmptyBlockNoteDocument(value);
  if (!blocks) return "";

  const lines: string[] = [];
  const walk = (list: BlockNoteBlock[]) => {
    for (const block of list) {
      lines.push(extractInlineText(block.content));
      if (block.children?.length) walk(block.children);
    }
  };
  walk(blocks);

  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines.join("\n");
}

/**
 * Texte brut -> document, un paragraphe par ligne.
 *
 * Les lignes vides sont conservées : c'est la seule façon de garder ses sauts de
 * paragraphe en convertissant une colonne texte multiligne en rich text.
 */
export function richTextFromPlainText(text: string): string {
  const blocks: BlockNoteBlock[] = text.split(/\r?\n/).map((line) => ({
    id: generateBlockId(),
    type: "paragraph",
    props: {
      backgroundColor: "default",
      textColor: "default",
      textAlignment: "left",
    },
    content: line ? [{ type: "text", text: line, styles: {} }] : [],
    children: [],
  }));
  return stringifyBlockNoteDocumentForStorage(blocks);
}
