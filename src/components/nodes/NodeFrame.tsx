import { NodeResizer, type Node } from "@xyflow/react";
import { memo, useCallback, useState } from "react";
import { cn } from "@/lib/utils";
import { colors } from "@/components/ui/styles";
import type { colorsEnum } from "@/types/domain";
import type { Id } from "@/../convex/_generated/dataModel";
import NodeHandles from "./NodeHandles";
import { useWindowsStore } from "@/stores/windowsStore";
import { canNodeTypeBeOpenedInWindow } from "@/components/nodes/prebuilt-nodes/prebuiltNodesConfig";
import { useIsNodeAttached } from "@/stores/noleStore";
import { useTemplate } from "@/stores/templatesStore";

function NodeFrame({
  xyNode,
  children,
  resizable = true,
}: {
  xyNode: Node;
  children: React.ReactNode;
  resizable?: boolean;
}) {
  const nodeColor = colors[(xyNode?.data?.color as colorsEnum) || "default"];
  const [isResizing, setIsResizing] = useState(false);
  const canDrag = true;
  const openWindow = useWindowsStore((state) => state.openWindow);
  const isAttachedToNole = useIsNodeAttached(xyNode.id);
  const nodeType = xyNode.type;

  // Custom nodes : l'ouvrabilité en window dépend du template (présence
  // d'un windowLayout), pas du type. Hook inconditionnel — templateId est
  // undefined pour les prébuilts, le sélecteur renvoie undefined.
  const template = useTemplate(xyNode.data?.templateId as string | undefined);

  const handleDoubleClick = useCallback(() => {
    const nodeDataId = xyNode.data?.nodeDataId as Id<"nodeDatas"> | undefined;
    if (!nodeDataId) return;

    if (nodeType === "custom") {
      if (template?.windowLayout === undefined) return;
      openWindow({
        xyNodeId: xyNode.id,
        nodeDataId,
        nodeType: "custom",
        windowSize: template.windowSize,
      });
      return;
    }

    if (canNodeTypeBeOpenedInWindow(nodeType)) {
      openWindow({
        xyNodeId: xyNode.id,
        nodeDataId,
        nodeType,
      });
    }
  }, [xyNode.data?.nodeDataId, xyNode.id, nodeType, openWindow, template]);

  if (!xyNode) return null;

  const hasDragAndResizeLatencyBug = nodeType === "app" || nodeType === "embed";

  return (
    <>
      <NodeHandles showSourceHandles={xyNode?.selected} nodeId={xyNode.id} />
      <NodeResizer
        isVisible={resizable && xyNode?.selected}
        onResizeStart={() => setIsResizing(true)}
        onResizeEnd={() => setIsResizing(false)}
        lineStyle={{
          borderWidth: 2,
        }}
        handleStyle={{
          height: 8,
          width: 8,
          borderRadius: 2,
          zIndex: 10,
        }}
      />
      <div
        className={cn(
          "relative rounded-[5px] text-card-foreground",
          "group h-full flex flex-col duration-150 border animate-node-appear",
          nodeColor.nodeBg,
          nodeColor.nodeBorder,
          isAttachedToNole &&
            "after:pointer-events-none after:absolute after:-inset-1 after:rounded-[8px] after:border-2 after:border-dashed after:border-violet-500/90",
          !canDrag && "nodrag",
          xyNode.selected
            ? "ring-2 ring-blue-500/70"
            : "hover:ring-1 hover:ring-blue-400/60",
        )}
        onDoubleClick={handleDoubleClick}
      >
        <div
          className={cn(
            "h-full rounded-[4px] relative",
            xyNode.data.color === "transparent"
              ? "bg-transparent"
              : "bg-white/80",
          )}
        >
          {hasDragAndResizeLatencyBug && (isResizing || xyNode.dragging) && (
            <div className="absolute inset-0 z-10" />
          )}
          {children}
        </div>
      </div>
    </>
  );
}

export default memo(NodeFrame);
