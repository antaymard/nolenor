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
  parseStoredBlockNoteDocument,
  stringifyBlockNoteDocumentForStorage,
  type BlockNoteBlock,
} from "./blockNoteDocument";

export function parseRichTextCell(value: unknown): BlockNoteBlock[] | null {
  const parsed = parseStoredBlockNoteDocument(value);
  if (!parsed || parsed.length === 0) return null;
  return parsed;
}

/** Aplatit un document en texte brut, un bloc par ligne. */
export function richTextToPlainText(value: unknown): string {
  const blocks = parseRichTextCell(value);
  if (!blocks) return "";

  const lines: string[] = [];
  const walk = (list: BlockNoteBlock[]) => {
    for (const block of list) {
      const text = extractInlineText(block.content);
      if (text) lines.push(text);
      if (block.children?.length) walk(block.children);
    }
  };
  walk(blocks);
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

export function isRichTextEmpty(value: unknown): boolean {
  return richTextToPlainText(value).trim().length === 0;
}
