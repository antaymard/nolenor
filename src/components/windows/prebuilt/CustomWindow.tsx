import { useCallback, useEffect, useMemo, useRef } from "react";
import { TbTemplateOff } from "react-icons/tb";
import type { Value } from "platejs";
import type { Id } from "@/../convex/_generated/dataModel";
import type { LayoutContainer } from "@/../convex/config/templateConfig";
import { stringifyPlateDocumentForStorage } from "@/../convex/lib/plateDocumentStorage";
import LayoutRenderer from "@/components/fields/layout/LayoutRenderer";
import { CustomFieldsContext } from "@/components/fields/registry/customFieldsContext";
import { useWindowFrameContext } from "@/components/windows/WindowFrameContext";
import { useNodeData } from "@/hooks/useNodeData";
import { useUpdateNodeDataValues } from "@/hooks/useUpdateNodeDataValues";
import { useNodeDataStore } from "@/stores/nodeDataStore";
import { useTemplate } from "@/stores/templatesStore";
import { useCanvasStore } from "@/stores/canvasStore";

// Window d'un custom node : rend le windowLayout du template.
// - Champs simples : commit au blur/change (optimiste + rollback).
// - Champs rich_text : éditeur Plate derrière le flux dirty/save du
//   WindowFrame (Mod+S / bouton Save), agrégé sur tous les champs
//   rich_text de la window — même UX que DocumentWindow.

export default function CustomWindow({
  nodeDataId,
}: {
  nodeDataId: Id<"nodeDatas">;
}) {
  const nodeData = useNodeData(nodeDataId);
  const template = useTemplate(nodeData?.templateId);
  const { updateNodeDataValues } = useUpdateNodeDataValues();
  const { setDirty, setSaveHandler } = useWindowFrameContext();
  const isReadOnly = useCanvasStore(
    (state) => state.canvas?._permission === "viewer",
  );

  const handleCommitField = useCallback(
    (fieldId: string, value: unknown) => {
      const current =
        useNodeDataStore.getState().getNodeData(nodeDataId)?.values ?? {};
      void updateNodeDataValues({
        nodeDataId,
        values: { ...current, [fieldId]: value },
      });
    },
    [nodeDataId, updateNodeDataValues],
  );

  // ── Agrégation rich_text (docs en attente + dirty par champ) ──────────
  const pendingDocsRef = useRef<Map<string, Value>>(new Map());
  const dirtyFieldsRef = useRef<Set<string>>(new Set());

  const customFieldsValue = useMemo(
    () => ({
      reportRichTextDoc: (fieldId: string, doc: Value) => {
        pendingDocsRef.current.set(fieldId, doc);
      },
      reportRichTextDirty: (fieldId: string, dirty: boolean) => {
        if (dirty) {
          dirtyFieldsRef.current.add(fieldId);
        } else {
          dirtyFieldsRef.current.delete(fieldId);
        }
        setDirty(dirtyFieldsRef.current.size > 0);
      },
    }),
    [setDirty],
  );

  const hasRichTextFields = Boolean(
    template?.fields.some((field) => field.type === "rich_text"),
  );

  useEffect(() => {
    if (!hasRichTextFields || isReadOnly) {
      setSaveHandler(null);
      return;
    }
    const handleSave = () => {
      if (dirtyFieldsRef.current.size === 0) return;
      const current =
        useNodeDataStore.getState().getNodeData(nodeDataId)?.values ?? {};
      const next: Record<string, unknown> = { ...current };
      for (const fieldId of dirtyFieldsRef.current) {
        const doc = pendingDocsRef.current.get(fieldId);
        if (doc) {
          // Stringify au call-site : useUpdateNodeDataValues ne
          // special-case que les nodes de type "document".
          next[fieldId] = stringifyPlateDocumentForStorage(doc);
        }
      }
      void updateNodeDataValues({ nodeDataId, values: next });
      dirtyFieldsRef.current.clear();
      setDirty(false);
    };
    setSaveHandler(handleSave);
    return () => setSaveHandler(null);
  }, [
    hasRichTextFields,
    isReadOnly,
    nodeDataId,
    setDirty,
    setSaveHandler,
    updateNodeDataValues,
  ]);

  if (!template) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
        <TbTemplateOff size={20} />
        <span className="text-sm">Unknown template</span>
      </div>
    );
  }

  if (!template.windowLayout) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        This template has no window layout.
      </div>
    );
  }

  return (
    <CustomFieldsContext.Provider value={customFieldsValue}>
      <div className="h-full overflow-y-auto">
        <LayoutRenderer
          tree={template.windowLayout as LayoutContainer}
          fields={template.fields}
          values={nodeData?.values ?? {}}
          surface="window"
          onCommitField={isReadOnly ? undefined : handleCommitField}
        />
      </div>
    </CustomFieldsContext.Provider>
  );
}
