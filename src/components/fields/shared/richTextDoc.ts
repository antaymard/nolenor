// Réexport : la primitive vit dans `convex/lib/blockNoteDocument`, à côté de
// `parseStoredBlockNoteDocument` dont elle n'est qu'une variante « non vide ».
// Les cellules de table en avaient écrit une copie identique.
export { parseNonEmptyBlockNoteDocument as parseRichTextDoc } from "@/../convex/lib/blockNoteDocument";
