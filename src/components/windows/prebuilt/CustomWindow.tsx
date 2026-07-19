import { useCallback } from "react";
import { TbTemplateOff } from "react-icons/tb";
import type { Id } from "@/../convex/_generated/dataModel";
import type { LayoutContainer } from "@/../convex/config/templateConfig";
import LayoutRenderer from "@/components/fields/layout/LayoutRenderer";
import { useNodeData } from "@/hooks/useNodeData";
import { useUpdateNodeDataValues } from "@/hooks/useUpdateNodeDataValues";
import { useNodeDataStore } from "@/stores/nodeDataStore";
import { useTemplate } from "@/stores/templatesStore";
import { useCanvasStore } from "@/stores/canvasStore";

// Window d'un custom node : rend le windowLayout du template. Tous les
// champs V1 committent au blur/change (pas d'état dirty) — le flux
// dirty/save de WindowFrameContext arrivera avec rich_text.

export default function CustomWindow({
  nodeDataId,
}: {
  nodeDataId: Id<"nodeDatas">;
}) {
  const nodeData = useNodeData(nodeDataId);
  const template = useTemplate(nodeData?.templateId);
  const { updateNodeDataValues } = useUpdateNodeDataValues();
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
    <div className="h-full overflow-y-auto">
      <LayoutRenderer
        tree={template.windowLayout as LayoutContainer}
        fields={template.fields}
        values={nodeData?.values ?? {}}
        surface="window"
        onCommitField={isReadOnly ? undefined : handleCommitField}
      />
    </div>
  );
}
