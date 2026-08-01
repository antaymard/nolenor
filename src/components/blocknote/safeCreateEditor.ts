import { BlockNoteEditor, type PartialBlock } from "@blocknote/core";

import { blockNoteSchema, type AppBlockNoteEditor } from "./schema";

export type SafeEditorStatus = "ok" | "corrupted-fallback";

export interface SafeEditorResult {
  editor: AppBlockNoteEditor;
  status: SafeEditorStatus;
  error?: unknown;
}

/**
 * `BlockNoteEditor.create` runs the real ProseMirror schema (`createChecked`)
 * over the initial content, which throws synchronously on a document that a
 * real editor could never have produced — e.g. a table cell smuggling a block
 * object as inline content, or an inconsistent colspan/rowspan grid (see
 * convex/lib/blockNoteDocument.ts for the server-side validation that should
 * catch these going forward). A persisted document written before that
 * validation existed can still trip this at any time.
 *
 * This wrapper is what stands between that throw and a blank window: on
 * failure it logs the error and falls back to constructing an editor with no
 * initial content, so the surrounding component gets a working (empty)
 * editor instead of a crash. The caller MUST gate saving behind an explicit
 * user acknowledgement when `status !== "ok"` — the parsed blocks are
 * dropped, not merged, so autosaving here would silently destroy whatever was
 * salvageable in the original document.
 */
export function createSafeBlockNoteEditor(
  parsedBlocks: PartialBlock[] | null,
): SafeEditorResult {
  const initialContent =
    parsedBlocks && parsedBlocks.length > 0 ? parsedBlocks : undefined;

  try {
    return {
      editor: BlockNoteEditor.create({ schema: blockNoteSchema, initialContent }),
      status: "ok",
    };
  } catch (error) {
    if (!initialContent) throw error;

    console.error(
      "[safeCreateEditor] BlockNoteEditor.create failed on stored content, falling back to an empty document:",
      error,
    );
    return {
      editor: BlockNoteEditor.create({ schema: blockNoteSchema }),
      status: "corrupted-fallback",
      error,
    };
  }
}
