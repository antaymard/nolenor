import {
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  forwardRef,
} from "react";
import type { Value } from "platejs";
import { Editor, EditorContainer } from "@/components/plate/editor";
import { EditorKit } from "@/components/plate/editor-kit";
import { Plate, usePlateEditor } from "platejs/react";
import type { BaseFieldProps } from "@/types/ui";
import { useCanvasStore } from "@/stores/canvasStore";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/shadcn/spinner";

export interface DocumentEditorFieldHandle {
  save: () => void;
}

interface DocumentEditorFieldProps extends BaseFieldProps<{ doc: Value }> {
  editorId?: string;
  plugins?: typeof EditorKit;
  isLocked?: boolean;
  onDirtyChange?: (isDirty: boolean) => void;
  onDocChange?: (doc: Value) => void;
}

const DocumentEditorField = forwardRef<
  DocumentEditorFieldHandle,
  DocumentEditorFieldProps
>(function DocumentEditorField(
  {
    editorId,
    value,
    visualType,
    onChange,
    plugins = EditorKit,
    isLocked,
    onDirtyChange,
    onDocChange,
  },
  ref,
) {
  const initialValue: Value = value?.doc as Value;
  const setFocus = useCanvasStore((s) => s.setFocus);
  const skipNextChangeRef = useRef(false);
  const applyFrameRef = useRef<number | null>(null);
  const lastAppliedServerSnapshotRef = useRef<string | null>(null);

  const editor = usePlateEditor({
    id: editorId ? `doc-${editorId}` : undefined,
    plugins,
    value: initialValue,
  });

  const serializeValue = useCallback(
    (doc: Value | undefined): string | null => {
      try {
        return JSON.stringify(doc ?? []);
      } catch {
        return null;
      }
    },
    [],
  );

  useEffect(() => {
    return () => {
      if (applyFrameRef.current !== null) {
        cancelAnimationFrame(applyFrameRef.current);
      }
    };
  }, []);

  // Last Write Wins: server value always overrides local content unconditionally
  useEffect(() => {
    if (!initialValue) return;

    const incomingSnapshot = serializeValue(initialValue);
    if (!incomingSnapshot) return;
    if (lastAppliedServerSnapshotRef.current === incomingSnapshot) return;

    const currentSnapshot = serializeValue(editor.children as Value);
    if (currentSnapshot === incomingSnapshot) {
      lastAppliedServerSnapshotRef.current = incomingSnapshot;
      onDirtyChange?.(false);
      return;
    }

    if (applyFrameRef.current !== null) {
      cancelAnimationFrame(applyFrameRef.current);
    }

    applyFrameRef.current = requestAnimationFrame(() => {
      skipNextChangeRef.current = true;
      editor.tf.withoutSaving(() => {
        editor.tf.setValue(initialValue);
      });
      lastAppliedServerSnapshotRef.current = incomingSnapshot;
      onDirtyChange?.(false);
    });
  }, [initialValue, editor, onDirtyChange, serializeValue]);

  const save = useCallback(() => {
    onChange?.({ doc: editor.children as Value });
    onDirtyChange?.(false);
  }, [onChange, onDirtyChange, editor]);

  useImperativeHandle(ref, () => ({ save }), [save]);

  const handleChange = useCallback(() => {
    onDocChange?.(editor.children as Value);
    if (skipNextChangeRef.current) {
      skipNextChangeRef.current = false;
      return;
    }
    onDirtyChange?.(true);
  }, [onDirtyChange, onDocChange, editor]);

  const handleFocus = useCallback(() => {
    if (isLocked) return;
    setFocus("platejs");
  }, [setFocus, isLocked]);

  const handleBlur = useCallback(() => {
    setFocus("canvas");
  }, [setFocus]);

  return (
    <div className="relative h-full" onFocus={handleFocus} onBlur={handleBlur}>
      <Plate editor={editor} onValueChange={handleChange}>
        <EditorContainer
          variant="default"
          className={cn(
            "nodrag h-full overflow-auto",
            visualType === "window" && "border border-border",
          )}
        >
          <Editor
            disableDefaultStyles={true}
            variant="none"
            placeholder="Start writing..."
            className="px-5 py-3"
            readOnly={isLocked}
          />
        </EditorContainer>
      </Plate>
      {isLocked && (
        <div className="absolute inset-0 flex items-center justify-center bg-card/60 rounded">
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner className="size-4" />
            IA en cours...
          </span>
        </div>
      )}
    </div>
  );
});

export default memo(DocumentEditorField);
