import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BlockNoteEditor,
  filterSuggestionItems,
  type PartialBlock,
} from "@blocknote/core";
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
import {
  blockNoteSchema,
  type AppBlockNoteEditor,
} from "@/components/blocknote/schema";
import { getDateSlashMenuItem } from "@/components/blocknote/dateSlashMenuItem";
import { getCalloutSlashMenuItem } from "@/components/blocknote/calloutSlashMenuItem";
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

function BlocknoteWindow({
  nodeDataId,
  onDocChange,
}: BlocknoteWindowProps) {
  const editorRef = useRef<AppBlockNoteEditor | null>(null);
  const latestDocRef = useRef<Block[] | null>(null);
  const hydrationFrameRef = useRef<number | null>(null);
  const hasHydratedOnceRef = useRef(false);
  const lastHydratedDocRef = useRef<unknown>(undefined);
  const skipNextChangeRef = useRef(false);
  const [isDirty, setIsDirty] = useState(false);
  const [shouldMountEditor, setShouldMountEditor] = useState(false);
  // Starts `true`: the editor is created synchronously with the initial server
  // content (see the creation useMemo below), so no hydration overlay is needed
  // on mount. The re-hydration effect toggles it around later remote updates.
  const [isEditorReady, setIsEditorReady] = useState(true);
  const { setDirty, setSaveHandler } = useWindowFrameContext();
  const nodeDataValues = useNodeDataValues(nodeDataId);
  const { updateNodeDataValues } = useUpdateNodeDataValues();
  const setFocus = useCanvasStore((s) => s.setFocus);

  const docSource = useMemo(
    () => nodeDataValues?.doc,
    [nodeDataValues?.doc],
  );

  const handleSaveClick = useCallback(async () => {
    const doc = latestDocRef.current ?? editorRef.current?.document;
    if (!doc) return;
    const success = await updateNodeDataValues({
      nodeDataId,
      values: { doc },
    });
    // Only clear dirty state once the server mutation has actually succeeded,
    // so a failed save keeps the unsaved-indicator on and the content editable.
    if (success) setIsDirty(false);
  }, [nodeDataId, updateNodeDataValues]);

  useEffect(() => {
    setSaveHandler(handleSaveClick);
    return () => setSaveHandler(null);
  }, [handleSaveClick, setSaveHandler]);

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

  // ── Editor creation (once) ──────────────────────────────────────────────
  // Created with the initial server content so the first paint is correct. We
  // record that first payload as already-hydrated so the re-hydration effect
  // below does NOT replace the blocks a second time on mount.
  const editor = useMemo(() => {
    const parsedBlocks = parseStoredBlockNoteDocument(docSource) as
      | PartialBlock[]
      | null;
    const instance = BlockNoteEditor.create({
      schema: blockNoteSchema,
      initialContent:
        parsedBlocks && parsedBlocks.length > 0 ? parsedBlocks : undefined,
    });
    editorRef.current = instance;
    lastHydratedDocRef.current = docSource;
    hasHydratedOnceRef.current = true;
    return instance;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Re-hydration (Last-Write-Wins) ───────────────────────────────────────
  // When the server pushes a doc different from the last one we hydrated, we
  // replace the editor's blocks. `skipNextChangeRef` suppresses the resulting
  // onChange so the window is not marked dirty from a remote update. An empty
  // document is applied as a single ephemeral empty paragraph (see above).
  useEffect(() => {
    if (!nodeDataValues) return;
    if (
      hasHydratedOnceRef.current &&
      Object.is(lastHydratedDocRef.current, docSource)
    ) {
      return;
    }

    lastHydratedDocRef.current = docSource;
    setIsEditorReady(false);

    if (hydrationFrameRef.current !== null) {
      cancelAnimationFrame(hydrationFrameRef.current);
    }

    const editor = editorRef.current;
    if (!editor) return;

    hydrationFrameRef.current = requestAnimationFrame(() => {
      const parsedBlocks = parseStoredBlockNoteDocument(docSource) as
        | PartialBlock[]
        | null;
      const blocks = parsedBlocks ?? [];
      const replacement =
        blocks.length > 0 ? blocks : ([EMPTY_PARAGRAPH] as PartialBlock[]);

      skipNextChangeRef.current = true;
      try {
        const allBlockIds = editor.document.map((b) => b.id);
        if (allBlockIds.length > 0) {
          editor.replaceBlocks(allBlockIds, replacement);
        } else {
          editor.insertBlocks(replacement, editor.document[editor.document.length - 1], "after");
        }
      } catch (err) {
        console.error("[BlocknoteWindow] replaceBlocks failed:", err);
        skipNextChangeRef.current = false;
      }

      setIsEditorReady(true);
      hasHydratedOnceRef.current = true;
    });
  }, [docSource, nodeDataValues]);

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
    setFocus("platejs");
  }, [setFocus]);

  const handleBlur = useCallback(() => {
    setFocus("canvas");
  }, [setFocus]);

  if (!nodeDataValues) return null;

  if (!shouldMountEditor) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <span className="flex items-center gap-2 text-sm text-slate-500">
          <Spinner className="size-4" />
          Chargement de l'editeur...
        </span>
      </div>
    );
  }

  return (
    <div
      className="relative h-full w-full"
      onFocus={handleFocus}
      onBlur={handleBlur}
    >
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
              [
                ...getDefaultReactSlashMenuItems(editor),
                getDateSlashMenuItem(editor),
                getCalloutSlashMenuItem(editor),
              ],
              query,
            )
          }
        />
      </BlockNoteView>
      {!isEditorReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/65">
          <span className="flex items-center gap-2 text-sm text-slate-500">
            <Spinner className="size-4" />
            Chargement de l'editeur...
          </span>
        </div>
      )}
    </div>
  );
}

export default memo(
  BlocknoteWindow,
  (prev, next) =>
    prev.nodeDataId === next.nodeDataId &&
    prev.onDocChange === next.onDocChange,
);
