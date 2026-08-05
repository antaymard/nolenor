import { useCallback, useEffect, useMemo, useRef } from "react";
import { TbTemplateOff } from "react-icons/tb";
import type { Id } from "@/../convex/_generated/dataModel";
import {
  collectLayoutPlacements,
  type LayoutContainer,
} from "@/../convex/config/templateConfig";
import { resolveFieldVariant } from "@/../convex/config/fieldVariants";
import LayoutRenderer from "@/components/fields/layout/LayoutRenderer";
import { CustomFieldsContext } from "@/components/fields/registry/customFieldsContext";
import { useWindowFrameContext } from "@/components/windows/WindowFrameContext";
import { useNodeData } from "@/hooks/useNodeData";
import { useUpdateNodeDataValues } from "@/hooks/useUpdateNodeDataValues";
import { useNodeDataStore } from "@/stores/nodeDataStore";
import { useTemplate } from "@/stores/templatesStore";
import { useCanvasStore } from "@/stores/canvasStore";

// Window d'un custom node : rend le windowLayout du template.
// - Variants à commit immédiat/blur : écriture directe (optimiste + rollback).
// - Variants à commit "deferred" (rich_text sur BlockNote) : derrière le flux
//   dirty/save du WindowFrame (Mod+S / bouton Save), agrégé sur tous les
//   champs différés de la window via CustomFieldsContext — même UX que
//   BlocknoteWindow.

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

  // ── Agrégation des champs à commit différé ────────────────────────────
  // Les valeurs arrivent DÉJÀ sérialisées sous leur forme stockée (l'éditeur
  // du champ s'en charge) : cette window n'a donc pas à connaître le type des
  // champs qu'elle sauvegarde.
  const pendingValuesRef = useRef<Map<string, unknown>>(new Map());
  const dirtyFieldsRef = useRef<Set<string>>(new Set());

  const customFieldsValue = useMemo(
    () => ({
      reportPendingValue: (fieldId: string, storedValue: unknown) => {
        pendingValuesRef.current.set(fieldId, storedValue);
      },
      reportDirty: (fieldId: string, dirty: boolean) => {
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

  // Le handler de save n'est posé que si un placement de CETTE window résout
  // réellement vers un variant à commit différé — dérivé du catalogue (et non
  // d'un `field.type === "rich_text"` codé en dur), pour qu'un futur type
  // différé soit pris en charge sans retoucher ce fichier. On raisonne sur les
  // placements, pas sur template.fields : un champ non placé en window ne
  // s'affiche pas, donc ne peut pas devenir dirty.
  const hasDeferredFields = useMemo(() => {
    const windowLayout = template?.windowLayout as LayoutContainer | undefined;
    if (!windowLayout) return false;
    const fieldsById = new Map(template!.fields.map((f) => [f.id, f]));
    return collectLayoutPlacements(windowLayout).some((placement) => {
      const field = fieldsById.get(placement.fieldId);
      if (!field) return false;
      return (
        resolveFieldVariant(field.type, "window", placement.variant).commit ===
        "deferred"
      );
    });
  }, [template]);

  useEffect(() => {
    if (!hasDeferredFields || isReadOnly) {
      setSaveHandler(null);
      return;
    }
    const handleSave = async (): Promise<boolean> => {
      if (dirtyFieldsRef.current.size === 0) return true;
      const fieldsToSave = new Set(dirtyFieldsRef.current);
      const current =
        useNodeDataStore.getState().getNodeData(nodeDataId)?.values ?? {};
      const next: Record<string, unknown> = { ...current };
      const savedValues = new Map<string, unknown>();
      for (const fieldId of fieldsToSave) {
        if (pendingValuesRef.current.has(fieldId)) {
          const value = pendingValuesRef.current.get(fieldId);
          savedValues.set(fieldId, value);
          next[fieldId] = value;
        }
      }
      const success = await updateNodeDataValues({ nodeDataId, values: next });
      if (success) {
        for (const fieldId of fieldsToSave) {
          if (!savedValues.has(fieldId)) continue;
          if (
            Object.is(
              pendingValuesRef.current.get(fieldId),
              savedValues.get(fieldId),
            )
          ) {
            dirtyFieldsRef.current.delete(fieldId);
          }
        }
        const hasPendingEdits = dirtyFieldsRef.current.size > 0;
        setDirty(hasPendingEdits);
        return !hasPendingEdits;
      }
      return success;
    };
    setSaveHandler(handleSave);
    return () => setSaveHandler(null);
  }, [
    hasDeferredFields,
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
