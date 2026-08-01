import { BlockNoteEditor, type Block } from "@blocknote/core";
import { blockNoteSchema } from "@/components/blocknote/schema";

// Client-only markdown -> BlockNote blocks conversion (paste handler). This is
// a genuine browser context, so — unlike the Convex codec in
// convex/ia/helpers/blockNoteMarkdown.ts, which needs a jsdom shim — a real
// BlockNoteEditor can be constructed directly and used to parse markdown.
//
// Lazy module-level singleton, same pattern as the fallback editor in
// BlockNoteStatic.tsx: constructing an editor isn't free, and every paste
// goes through this.
let converter: BlockNoteEditor<
  typeof blockNoteSchema.blockSchema,
  typeof blockNoteSchema.inlineContentSchema,
  typeof blockNoteSchema.styleSchema
> | null = null;

function getConverter() {
  converter ??= BlockNoteEditor.create({ schema: blockNoteSchema });
  return converter;
}

/**
 * Parse plain/markdown text into BlockNote blocks. Always returns at least one
 * block (an empty paragraph for empty input) — `tryParseMarkdownToBlocks`
 * itself guarantees this, it never returns an empty array.
 *
 * The custom schema only widens inline content (date pill); the resulting
 * JSON shape is unchanged, hence the cast to the default `Block` type — same
 * rationale as the `editor.document` casts in BlocknoteWindow.tsx /
 * BlockNoteFieldEditor.tsx.
 */
export function markdownToBlockNoteBlocks(markdown: string): Block[] {
  return getConverter().tryParseMarkdownToBlocks(markdown) as unknown as Block[];
}
