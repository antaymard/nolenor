import { useWindowsStore, type OpenedWindow } from "@/stores/windowsStore";
import { useNodeDataTitle } from "@/hooks/useNodeTitle";
import { useNodeData } from "@/hooks/useNodeData";
import { getNodeIcon } from "@/components/utils/nodeDataDisplayUtils";
import { useGoToNode } from "@/hooks/useGoToNode";
import { X } from "lucide-react";
import { TbLocation } from "react-icons/tb";

export default function MinimizedWindowPill({
  window: openedWindow,
}: {
  window: OpenedWindow;
}) {
  const toggleMinimizeWindow = useWindowsStore((s) => s.toggleMinimizeWindow);
  const closeWindow = useWindowsStore((s) => s.closeWindow);
  const goToNode = useGoToNode();

  const title = useNodeDataTitle(openedWindow.nodeDataId);
  const nodeData = useNodeData(openedWindow.nodeDataId);
  const NodeIcon = getNodeIcon(nodeData?.type);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1) {
      e.preventDefault();
      closeWindow(openedWindow.xyNodeId);
    }
  };

  return (
    <button
      type="button"
      onClick={() => toggleMinimizeWindow(openedWindow.xyNodeId)}
      onMouseDown={handleMouseDown}
      title={title ?? undefined}
      className="group pointer-events-auto relative flex h-8 max-w-[280px] items-center gap-2 rounded-md border bg-card pl-2.5 pr-12 text-left text-sm shadow-md transition-colors animate-in fade-in slide-in-from-bottom-2 duration-200 hover:bg-accent/60"
    >
      {NodeIcon ? (
        <NodeIcon className="size-4 shrink-0 text-muted-foreground" />
      ) : null}
      <span className="min-w-0 flex-1 truncate font-medium text-foreground">
        {title ?? "—"}
      </span>
      <span
        role="button"
        aria-label="Go to node"
        onClick={(e) => {
          e.stopPropagation();
          goToNode(openedWindow.xyNodeId);
        }}
        onMouseDown={(e) => e.stopPropagation()}
        className="absolute right-6 top-1/2 -translate-y-1/2 flex h-5 w-5 items-center justify-center rounded opacity-0 transition-opacity hover:bg-(--brand)/15 hover:text-(--brand) group-hover:opacity-100"
      >
        <TbLocation size={12} />
      </span>
      <span
        role="button"
        aria-label="Close window"
        onClick={(e) => {
          e.stopPropagation();
          closeWindow(openedWindow.xyNodeId);
        }}
        onMouseDown={(e) => e.stopPropagation()}
        className="absolute right-1 top-1/2 -translate-y-1/2 flex h-5 w-5 items-center justify-center rounded opacity-0 transition-opacity hover:bg-destructive/15 hover:text-destructive group-hover:opacity-100"
      >
        <X size={12} />
      </span>
    </button>
  );
}
