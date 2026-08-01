import { memo, useCallback, useEffect, useRef, useState } from "react";
import { filterSuggestionItems, type PartialBlock } from "@blocknote/core";
import { BlockNoteView } from "@blocknote/shadcn";
import {
  getDefaultReactSlashMenuItems,
  SuggestionMenuController,
} from "@blocknote/react";
import type { Block } from "@blocknote/core";
import { useNodeDataValues } from "@/hooks/useNodeData";
import { useUpdateNodeDataValues } from "@/hooks/useUpdateNodeDataValues";
import type { Id } from "@/../convex/_generated/dataModel";
import { useWindowFrameContext } from "@/components/windows/WindowFrameContext";
import { parseStoredBlockNoteDocument } from "@/../convex/lib/blockNoteDocument";
import type { AppBlockNoteEditor } from "@/components/blocknote/schema";
import {
  getCustomSlashMenuItems,
  groupSuggestionItems,
} from "@/components/blocknote/registry";
import { createSafeBlockNoteEditor } from "@/components/blocknote/safeCreateEditor";
import CorruptedDocumentBanner from "@/components/blocknote/CorruptedDocumentBanner";
import { BlockNoteErrorBoundary } from "@/components/blocknote/BlockNoteErrorBoundary";
import { Spinner } from "@/components/shadcn/spinner";
import { useCanvasStore } from "@/stores/canvasStore";
import { cn } from "@/lib/utils";

interface BlocknoteWindowProps {
  nodeDataId: Id<"nodeDatas">;
  onDocChange?: (doc: Block[]) => void;
}

// A single empty paragraph used to visually clear the editor when the server
// pushes an empty document (e.g. the agent deleted every block). It is never
// persisted: the next user keystroke triggers a normal save of the resulting
// document, and a no-op save is skipped because the dirty flag is only set by
// genuine user edits.
const EMPTY_PARAGRAPH: PartialBlock = { type: "paragraph" };

/**
 * Canonical form of a stored doc, used to tell "the server sent something new"
 * from "the server echoed what we just wrote".
 *
 * The same document reaches us in two shapes: the optimistic store update
 * writes the live `Block[]`, then Convex pushes back the serialized string.
 * Comparing by reference (as this component used to) treated both as remote
 * changes and re-hydrated the editor twice per save — an overlay flash and a
 * lost cursor each time.
 */
function docSignature(doc: unknown): string {
  if (doc === undefined || doc === null) return "";
  return typeof doc === "string" ? doc : JSON.stringify(doc);
}

function EditorLoading() {
  return (
    <span className="flex items-center gap-2 text-sm text-slate-500">
      <Spinner className="size-4" />
      Chargement de l'éditeur...
    </span>
  );
}

function BlocknoteWindow({ nodeDataId, onDocChange }: BlocknoteWindowProps) {
  const latestDocRef = useRef<Block[] | null>(null);
  const hydrationFrameRef = useRef<number | null>(null);
  const skipNextChangeRef = useRef(false);
  const [isDirty, setIsDirty] = useState(false);
  const [shouldMountEditor, setShouldMountEditor] = useState(false);
  // Starts `true`: the editor is created synchronously with the initial server
  // content (see the creation useState below), so no hydration overlay is needed
  // on mount. The re-hydration effect toggles it around later remote updates.
  const [isEditorReady, setIsEditorReady] = useState(true);
  const { setDirty, setSaveHandler } = useWindowFrameContext();
  const nodeDataValues = useNodeDataValues(nodeDataId);
  const { updateNodeDataValues } = useUpdateNodeDataValues();
  const setFocus = useCanvasStore((s) => s.setFocus);

  const docSource = nodeDataValues?.doc;

  // ── Editor creation (once) ──────────────────────────────────────────────
  // Created with the initial server content so the first paint is correct. The
  // initial payload is recorded as already-hydrated so the re-hydration effect
  // below does NOT replace the blocks a second time on mount.
  //
  // `createSafeBlockNoteEditor` guards against a stored document that trips
  // ProseMirror's schema (e.g. a malformed table) — see safeCreateEditor.ts.
  // On failure it hands back a working *empty* editor instead of throwing, so
  // `isCorrupted` gates both saving and edits behind an explicit user
  // confirmation (CorruptedDocumentBanner below): the original content is
  // dropped from the in-memory editor, but stays recoverable server-side
  // until the user acknowledges losing it.
  const [{ editor, isCorrupted }] = useState<{
    editor: AppBlockNoteEditor;
    isCorrupted: boolean;
  }>(() => {
    const parsedBlocks = parseStoredBlockNoteDocument(docSource) as
      | PartialBlock[]
      | null;
    const result = createSafeBlockNoteEditor(parsedBlocks);
    return { editor: result.editor, isCorrupted: result.status !== "ok" };
  });
  const [isCorruptionAcknowledged, setIsCorruptionAcknowledged] =
    useState(!isCorrupted);
  const lastHydratedSignatureRef = useRef<string | null>(null);
  if (lastHydratedSignatureRef.current === null) {
    lastHydratedSignatureRef.current = docSignature(docSource);
  }

  const handleSaveClick = useCallback(async () => {
    const doc = latestDocRef.current ?? editor.document;
    if (!doc) return;
    // Remember what we are writing: the optimistic store update and the server
    // echo both come back through `docSource`, and neither should re-hydrate.
    lastHydratedSignatureRef.current = docSignature(doc);
    const success = await updateNodeDataValues({
      nodeDataId,
      values: { doc },
    });
    // Only clear dirty state once the server mutation has actually succeeded,
    // so a failed save keeps the unsaved-indicator on and the content editable.
    if (success) setIsDirty(false);
  }, [editor, nodeDataId, updateNodeDataValues]);

  // Save is only wired up once any corruption banner has been acknowledged —
  // otherwise the window's own Save button (in the surrounding chrome, not
  // covered by the banner overlay below) could silently overwrite the
  // original stored document with the empty fallback before the user agreed
  // to lose it.
  useEffect(() => {
    if (!isCorruptionAcknowledged) return;
    setSaveHandler(handleSaveClick);
    return () => setSaveHandler(null);
  }, [handleSaveClick, setSaveHandler, isCorruptionAcknowledged]);

  const handleContinueFromCorruption = useCallback(() => {
    setIsCorruptionAcknowledged(true);
    // The user just explicitly agreed to drop the corrupted content — persist
    // the recovered (empty) document immediately rather than waiting for a
    // save that may never come if they close the window without editing,
    // which would otherwise leave the crash-inducing document in storage.
    void handleSaveClick();
  }, [handleSaveClick]);

  useEffect(() => {
    setDirty(isDirty);
  }, [isDirty, setDirty]);

  useEffect(() => {
    return () => {
      if (hydrationFrameRef.current !== null) {
        cancelAnimationFrame(hydrationFrameRef.current);
      }
    };
  }, []);

  // Defer heavy editor mount so the window frame can paint immediately.
  useEffect(() => {
    const frameId = requestAnimationFrame(() => setShouldMountEditor(true));
    return () => cancelAnimationFrame(frameId);
  }, []);

  // ── Re-hydration (Last-Write-Wins) ───────────────────────────────────────
  // When the server pushes a doc whose content differs from the last one we
  // hydrated or saved, we replace the editor's blocks. `skipNextChangeRef`
  // suppresses the resulting onChange so the window is not marked dirty from a
  // remote update. An empty document is applied as a single ephemeral empty
  // paragraph (see above).
  useEffect(() => {
    if (!nodeDataValues) return;
    const signature = docSignature(docSource);
    if (signature === lastHydratedSignatureRef.current) return;

    lastHydratedSignatureRef.current = signature;
    setIsEditorReady(false);

    if (hydrationFrameRef.current !== null) {
      cancelAnimationFrame(hydrationFrameRef.current);
    }

    hydrationFrameRef.current = requestAnimationFrame(() => {
      hydrationFrameRef.current = null;
      const parsedBlocks = parseStoredBlockNoteDocument(docSource) as
        | PartialBlock[]
        | null;
      const replacement =
        parsedBlocks && parsedBlocks.length > 0 ? parsedBlocks : [EMPTY_PARAGRAPH];

      skipNextChangeRef.current = true;
      try {
        // BlockNote always keeps at least one block, so the document is never
        // empty here and `replaceBlocks` covers the whole tree.
        editor.replaceBlocks(
          editor.document.map((b) => b.id),
          replacement,
        );
      } catch (err) {
        console.error("[BlocknoteWindow] replaceBlocks failed:", err);
      } finally {
        // Clear unconditionally: if replaceBlocks emitted no onChange, a stale
        // `true` would swallow the user's next edit and lose the dirty flag.
        skipNextChangeRef.current = false;
      }

      setIsEditorReady(true);
    });
  }, [docSource, editor, nodeDataValues]);

  const handleChange = useCallback(() => {
    // The custom schema only widens inline content (date pill); the stored
    // JSON shape is unchanged, hence the cast to the default Block type.
    const doc = editor.document as unknown as Block[];
    latestDocRef.current = doc;
    onDocChange?.(doc);
    if (skipNextChangeRef.current) {
      skipNextChangeRef.current = false;
      return;
    }
    setIsDirty(true);
  }, [onDocChange, editor]);

  const handleFocus = useCallback(() => {
    setFocus("richtext-editor");
  }, [setFocus]);

  const handleBlur = useCallback(() => {
    setFocus("canvas");
  }, [setFocus]);

  if (!nodeDataValues) return null;

  if (!shouldMountEditor) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <EditorLoading />
      </div>
    );
  }

  return (
    <div
      className="relative h-full w-full"
      onFocus={handleFocus}
      onBlur={handleBlur}
    >
      <BlockNoteErrorBoundary resetKey={docSource}>
        <BlockNoteView
          editor={editor}
          theme="light"
          onChange={handleChange}
          className={cn("nodrag h-full overflow-auto")}
          slashMenu={false}
        >
          <SuggestionMenuController
            triggerCharacter="/"
            shouldOpen={(tr) =>
              !tr.selection.$from.parent.type.isInGroup("tableContent")
            }
            getItems={async (query) =>
              filterSuggestionItems(
                groupSuggestionItems([
                  ...getDefaultReactSlashMenuItems(editor),
                  ...getCustomSlashMenuItems(editor),
                ]),
                query,
              )
            }
          />
        </BlockNoteView>
      </BlockNoteErrorBoundary>
      {!isEditorReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/65">
          <EditorLoading />
        </div>
      )}
      {!isCorruptionAcknowledged && (
        <CorruptedDocumentBanner onContinue={handleContinueFromCorruption} />
      )}
    </div>
  );
}

export default memo(BlocknoteWindow);
