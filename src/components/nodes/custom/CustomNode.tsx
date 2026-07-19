import { memo, useCallback } from "react";
import type { Node } from "@xyflow/react";
import { TbTemplateOff } from "react-icons/tb";
import type { Id } from "@/../convex/_generated/dataModel";
import type { LayoutContainer } from "@/../convex/config/templateConfig";
import NodeFrame from "@/components/nodes/NodeFrame";
import { areNodePropsEqual } from "@/components/nodes/areNodePropsEqual";
import LayoutRenderer from "@/components/fields/layout/LayoutRenderer";
import { useNodeDataValues } from "@/hooks/useNodeData";
import { useUpdateNodeDataValues } from "@/hooks/useUpdateNodeDataValues";
import { useNodeDataStore } from "@/stores/nodeDataStore";
import { useTemplate } from "@/stores/templatesStore";
import { useCanvasStore } from "@/stores/canvasStore";

// Node custom : rend le nodeLayout de son template. Le template est résolu
// par id via le store (jamais embarqué dans les data React Flow), donc
// éditer un template ne re-rend que ses instances.

function CustomNode(xyNode: Node) {
  const nodeDataId = xyNode.data?.nodeDataId as Id<"nodeDatas"> | undefined;
  const templateId = xyNode.data?.templateId as string | undefined;

  const template = useTemplate(templateId);
  const values = useNodeDataValues(nodeDataId);
  const { updateNodeDataValues } = useUpdateNodeDataValues();
  const isReadOnly = useCanvasStore(
    (state) => state.canvas?._permission === "viewer",
  );

  const handleCommitField = useCallback(
    (fieldId: string, value: unknown) => {
      if (!nodeDataId) return;
      const current =
        useNodeDataStore.getState().getNodeData(nodeDataId)?.values ?? {};
      void updateNodeDataValues({
        nodeDataId,
        values: { ...current, [fieldId]: value },
      });
    },
    [nodeDataId, updateNodeDataValues],
  );

  return (
    <NodeFrame
      xyNode={xyNode}
      resizable={template?.defaultDimensions.resizable !== false}
    >
      {template ? (
        <div className="h-full overflow-hidden">
          <LayoutRenderer
            tree={template.nodeLayout as LayoutContainer}
            fields={template.fields}
            values={values ?? {}}
            surface="node"
            onCommitField={isReadOnly ? undefined : handleCommitField}
          />
        </div>
      ) : (
        // Template pas (encore) résolu : placeholder, jamais de crash
        // (course de sync, paste cross-user, template supprimé de la DB).
        <div className="h-full flex flex-col items-center justify-center gap-1 text-muted-foreground p-2">
          <TbTemplateOff size={16} />
          <span className="text-xs text-center">Unknown template</span>
        </div>
      )}
    </NodeFrame>
  );
}

export default memo(CustomNode, areNodePropsEqual);
