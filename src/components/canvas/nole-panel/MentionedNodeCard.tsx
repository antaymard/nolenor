import { useStore, useReactFlow } from "@xyflow/react";
import { useNodeDataStore } from "@/stores/nodeDataStore";
import { NODE_TYPE_ICON_MAP } from "@/components/nodes/prebuilt-nodes/nodeIconMap";
import { getNodeDataTitle } from "@/components/utils/nodeDataDisplayUtils";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useWindowsStore } from "@/stores/windowsStore";
import { canNodeTypeBeOpenedInWindow } from "@/components/nodes/prebuilt-nodes/prebuiltNodesConfig";

interface MentionedNodeCardProps {
  nodeId: string;
  inline?: boolean;
  fallback?: React.ReactNode;
}

export function MentionedNodeCard({
  nodeId,
  inline,
  fallback,
}: MentionedNodeCardProps) {
  const nodes = useStore((state) => state.nodes);
  const nodeDatas = useNodeDataStore((state) => state.nodeDatas);
  const { fitView } = useReactFlow();
  const isMobile = useIsMobile();
  const openWindow = useWindowsStore((state) => state.openWindow);

  const xyNode = nodes.find((n) => n.id === nodeId);
  const nodeDataId = xyNode?.data?.nodeDataId as string | undefined;
  const nodeData = nodeDataId ? nodeDatas.get(nodeDataId as any) : undefined;

  if (!xyNode || !nodeData) {
    // Pas de node correspondant : on tombe en fallback sur le texte d'origine
    // pour ne pas faire disparaître un faux positif du parseur de node IDs.
    return fallback !== undefined ? <>{fallback}</> : null;
  }

  const title = getNodeDataTitle(nodeData);
  const Icon = NODE_TYPE_ICON_MAP[nodeData.type] || NODE_TYPE_ICON_MAP.title;

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isMobile) {
      if (
        nodeDataId &&
        nodeData &&
        canNodeTypeBeOpenedInWindow(nodeData.type)
      ) {
        openWindow({
          xyNodeId: nodeId,
          nodeDataId: nodeDataId as Parameters<
            typeof openWindow
          >[0]["nodeDataId"],
          nodeType: nodeData.type,
        });
      }
      return;
    }
    fitView({
      nodes: [{ id: nodeId }],
      duration: 800,
      minZoom: 0.5,
      maxZoom: 1.2,
    });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        "group flex items-center gap-1.5 rounded border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-700 transition-colors",
        inline
          ? "inline-flex align-middle mx-1 -translate-y-0.5"
          : "flex w-fit max-w-50",
        "hover:border-slate-300 hover:bg-slate-50 cursor-pointer",
      )}
      title={title || "Node"}
    >
      <Icon size={12} className="shrink-0 text-slate-500" />
      <span className="truncate max-w-37.5 font-medium">
        {title || nodeData.type}
      </span>
    </button>
  );
}
