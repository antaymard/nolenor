import {
  parseStoredBlockNoteDocument,
  type BlockNoteBlock,
} from "@/../convex/lib/blockNoteDocument";

// La value stockée est un tableau de blocs BlockNote stringifié — même
// convention que les nodes blocknote prébuilts, donc les mêmes helpers de
// parsing et le même renderer statique (BlockNoteStatic).
function parseRichTextDoc(value: unknown): BlockNoteBlock[] | null {
  const parsed = parseStoredBlockNoteDocument(value);
  if (!parsed || parsed.length === 0) return null;
  return parsed;
}

export { parseRichTextDoc };
