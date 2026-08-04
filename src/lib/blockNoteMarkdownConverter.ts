import { BlockNoteEditor, type Block, type PartialBlock } from "@blocknote/core";
import { blockNoteSchema } from "@/components/blocknote/schema";
import { createSafeBlockNoteEditor } from "@/components/blocknote/safeCreateEditor";

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

/**
 * Sérialise des blocs BlockNote en Markdown. Lossy par nature : les props de
 * bloc (couleurs, alignement) et les types custom n'ont pas d'équivalent
 * Markdown.
 *
 * Les blocs sont chargés dans un éditeur dédié plutôt que dans le singleton :
 * un document stocké avant que la validation serveur n'existe peut faire
 * throw `createChecked`, et `createSafeBlockNoteEditor` absorbe ce cas.
 *
 * Le statut est rendu plutôt qu'aplati sur `null` : un document illisible et un
 * document vide appellent des messages différents côté export.
 */
export function blockNoteBlocksToMarkdown(
  blocks: PartialBlock[],
): { status: "ok"; markdown: string } | { status: "unreadable" } {
  const { editor, status } = createSafeBlockNoteEditor(blocks);
  if (status !== "ok") return { status: "unreadable" };
  return {
    status: "ok",
    markdown: editor.blocksToMarkdownLossy(editor.document).trim(),
  };
}
