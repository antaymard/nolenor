/**
 * Helpers de la cellule `richtext`.
 *
 * L'implémentation vit dans `convex/lib/tableRichTextCell` : le serveur en a
 * besoin aussi (formatage pour l'agent, indexation full-text, tools de table) et
 * les deux côtés doivent lire une cellule rich text exactement pareil. Ce
 * fichier n'est qu'un point d'entrée pour le dossier `table/`.
 */
export {
  isRichTextEmpty,
  parseRichTextCell,
  richTextFromPlainText,
  richTextToPlainText,
} from "@/../convex/lib/tableRichTextCell";
