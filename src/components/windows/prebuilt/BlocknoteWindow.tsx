import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BlockNoteEditor, type PartialBlock } from "@blocknote/core";
import { BlockNoteView } from "@blocknote/shadcn";
import type { Block } from "@blocknote/core";
import { useNodeDataValues } from "@/hooks/useNodeData";
import { useUpdateNodeDataValues } from "@/hooks/useUpdateNodeDataValues";
import type { Id } from "@/../convex/_generated/dataModel";
import { useWindowFrameContext } from "@/components/windows/WindowFrameContext";
import { parseStoredPlateDocument } from "@/../convex/lib/plateDocumentStorage";
import { Spinner } from "@/components/shadcn/spinner";
import { useCanvasStore } from "@/stores/canvasStore";
import { cn } from "@/lib/utils";

interface BlocknoteWindowProps {
  nodeDataId: Id<"nodeDatas">;
  onDocChange?: (doc: Block[]) => void;
}

function BlocknoteWindow({
  nodeDataId,
  onDocChange,
}: BlocknoteWindowProps) {
  const editorRef = useRef<BlockNoteEditor | null>(null);
  const hydrationFrameRef = useRef<number | null>(null);
  const hasHydratedOnceRef = useRef(false);
  const lastHydratedDocRef = useRef<unknown>(undefined);
  const skipNextChangeRef = useRef(false);
  const [isDirty, setIsDirty] = useState(false);
  const [shouldMountEditor, setShouldMountEditor] = useState(false);
  const [isEditorReady, setIsEditorReady] = useState(false);
  const { setDirty, setSaveHandler } = useWindowFrameContext();
  const nodeDataValues = useNodeDataValues(nodeDataId);
  const isLocked = false;
  const { updateNodeDataValues } = useUpdateNodeDataValues();
  const setFocus = useCanvasStore((s) => s.setFocus);

  const docSource = useMemo(
    () => nodeDataValues?.doc,
    [nodeDataValues?.doc],
  );

  const handleSaveClick = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    updateNodeDataValues({
      nodeDataId,
      values: { doc: editor.document },
    });
    setIsDirty(false);
  }, [nodeDataId, updateNodeDataValues]);

  useEffect(() => {
    setSaveHandler(handleSaveClick);
    return () => setSaveHandler(null);
  }, [handleSaveClick, setSaveHandler]);

  useEffect(() => {
    setDirty(isDirty && !isLocked);
  }, [isDirty, isLocked, setDirty]);

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

  // ── Re-hydration (Last-Write-Wins) ──────────────────────────────────────
  // When the server pushes a doc different from what we last hydrated, we
  // replace the editor's blocks. The skipNextChangeRef prevents the
  // resulting onChange from marking the window as dirty.
  useEffect(() => {
    if (!nodeDataValues) return;
    if (
      hasHydratedOnceRef.current &&
      Object.is(lastHydratedDocRef.current, docSource)
    ) {
      return;
    }

    if (!hasHydratedOnceRef.current) {
      setIsEditorReady(false);
    }
    lastHydratedDocRef.current = docSource;

    if (hydrationFrameRef.current !== null) {
      cancelAnimationFrame(hydrationFrameRef.current);
    }

    const editor = editorRef.current;
    if (!editor) return;

    hydrationFrameRef.current = requestAnimationFrame(() => {
      const parsedBlocks = parseStoredPlateDocument(docSource) as
        | PartialBlock[]
        | null;
      const blocks = parsedBlocks ?? [];

      if (blocks.length > 0) {
        skipNextChangeRef.current = true;
        const allBlockIds = editor.document.map((b) => b.id);
        if (allBlockIds.length > 0) {
          editor.replaceBlocks(allBlockIds, blocks);
        } else {
          editor.insertBlocks(
            blocks,
            editor.document[editor.document.length - 1],
            "after",
          );
        }
      }

      setIsEditorReady(true);
      hasHydratedOnceRef.current = true;
    });
  }, [docSource, nodeDataValues, editorRef]);

  // ── Editor creation (once) ──────────────────────────────────────────────
  // Created with initial content from the server; subsequent updates are
  // handled by the re-hydration effect above.
  const editor = useMemo(() => {
    const parsedBlocks = parseStoredPlateDocument(docSource) as
      | PartialBlock[]
      | null;
    const instance = BlockNoteEditor.create({
      initialContent: parsedBlocks && parsedBlocks.length > 0 ? parsedBlocks : undefined,
    });
    editorRef.current = instance;
    return instance;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChange = useCallback(() => {
    onDocChange?.(editor.document);
    if (skipNextChangeRef.current) {
      skipNextChangeRef.current = false;
      return;
    }
    setIsDirty(true);
  }, [onDocChange, editor]);

  const handleFocus = useCallback(() => {
    if (isLocked) return;
    setFocus("platejs");
  }, [setFocus, isLocked]);

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
        editable={!isLocked}
        onChange={handleChange}
        className={cn("nodrag h-full overflow-auto")}
      />
      {!isEditorReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/65">
          <span className="flex items-center gap-2 text-sm text-slate-500">
            <Spinner className="size-4" />
            Chargement de l'editeur...
          </span>
        </div>
      )}
      {isLocked && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/60 rounded">
          <span className="flex items-center gap-2 text-sm text-slate-500">
            <Spinner className="size-4" />
            IA en cours...
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
