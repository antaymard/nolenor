import { normalizeNodeId, type Value } from "platejs";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import DocumentEditorField, {
  type DocumentEditorFieldHandle,
} from "@/components/fields/document-fields/DocumentEditorField";
import { useNodeDataValues } from "@/hooks/useNodeData";
import { useUpdateNodeDataValues } from "@/hooks/useUpdateNodeDataValues";
import type { Id } from "@/../convex/_generated/dataModel";
import { useWindowFrameContext } from "@/components/windows/WindowFrameContext";
import { parseStoredPlateDocument } from "@/../convex/lib/plateDocumentStorage";
import { Spinner } from "@/components/shadcn/spinner";
import { PlateErrorBoundary } from "@/components/plate/PlateErrorBoundary";

interface DocumentWindowProps {
  xyNodeId: string;
  nodeDataId: Id<"nodeDatas">;
  onDocChange?: (doc: Value) => void;
}

function DocumentWindow({
  xyNodeId,
  nodeDataId,
  onDocChange,
}: DocumentWindowProps) {
  const editorRef = useRef<DocumentEditorFieldHandle>(null);
  // Keep track of scheduled hydration work to cancel stale frames.
  const hydrationFrameRef = useRef<number | null>(null);
  // Initial loading should be shown only for the first hydration cycle.
  const hasHydratedOnceRef = useRef(false);
  // Prevent re-hydrating when Convex pushes the same doc payload.
  const lastHydratedDocRef = useRef<unknown>(undefined);
  const [isDirty, setIsDirty] = useState(false);
  const [shouldMountEditor, setShouldMountEditor] = useState(false);
  const [isEditorReady, setIsEditorReady] = useState(false);
  const [editorValue, setEditorValue] = useState<{ doc: Value }>({ doc: [] });
  const { setDirty, setSaveHandler } = useWindowFrameContext();
  const nodeDataValues = useNodeDataValues(nodeDataId);
  const isLocked = false;
  const { updateNodeDataValues } = useUpdateNodeDataValues();

  const handleSaveClick = useCallback(() => {
    editorRef.current?.save();
  }, []);

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

  useEffect(() => {
    // Defer heavy editor mount so the window frame can paint immediately.
    const frameId = requestAnimationFrame(() => setShouldMountEditor(true));
    return () => cancelAnimationFrame(frameId);
  }, []);

  const handleSave = useCallback(
    (newValue: { doc: Value }) => {
      updateNodeDataValues({
        nodeDataId,
        values: newValue,
      });
    },
    [nodeDataId, updateNodeDataValues],
  );

  const docSource = useMemo(() => nodeDataValues?.doc, [nodeDataValues?.doc]);

  useEffect(() => {
    if (!nodeDataValues) return;
    // Skip expensive parse/normalize only after the initial hydration completed.
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

    hydrationFrameRef.current = requestAnimationFrame(() => {
      // Parse persisted payload then normalize node ids for Plate runtime.
      const parsedDoc = parseStoredPlateDocument(docSource);
      setEditorValue({
        doc: parsedDoc ? normalizeNodeId(parsedDoc as Value) : [],
      });
      setIsEditorReady(true);
      hasHydratedOnceRef.current = true;
    });
  }, [docSource, nodeDataValues]);

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
    <div className="relative h-full w-full">
      <PlateErrorBoundary resetKey={docSource}>
        <DocumentEditorField
          ref={editorRef}
          editorId={xyNodeId}
          value={editorValue}
          onChange={handleSave}
          isLocked={isLocked}
          onDirtyChange={setIsDirty}
          onDocChange={onDocChange}
        />
      </PlateErrorBoundary>
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
  DocumentWindow,
  (prev, next) =>
    prev.xyNodeId === next.xyNodeId &&
    prev.nodeDataId === next.nodeDataId &&
    prev.onDocChange === next.onDocChange,
);
