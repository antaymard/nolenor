import { useState } from "react";
import { useReactFlow } from "@xyflow/react";
import type { Id } from "@/../convex/_generated/dataModel";
import { useNodeData } from "@/hooks/useNodeData";
import { useNodeDataTitle } from "@/hooks/useNodeTitle";
import { useNodeIdsByDataId } from "@/lib/nodeIdentity";
import { useWindowsStore } from "@/stores/windowsStore";
import { useGoToNode } from "@/hooks/useGoToNode";
import { NODE_TYPE_ICON_MAP } from "@/components/nodes/prebuilt-nodes/nodeIconMap";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/shadcn/popover";
import { cn } from "@/lib/utils";

/**
 * One row in the Links tab (backlink or connection): icon + live title,
 * clickable — opens the node's window, falling back to navigating to it on
 * the canvas, same rule `openWindow` already applies everywhere else
 * (mention pills, table node cells). Hovering shows `snippet` when provided
 * (backlinks only — connections have nothing to preview).
 */
export function NodeLinkRow({
  nodeDataId,
  snippet,
  prefix,
}: {
  nodeDataId: Id<"nodeDatas">;
  snippet?: string;
  /** Small leading marker, e.g. a direction arrow for connections. */
  prefix?: string;
}) {
  const title = useNodeDataTitle(nodeDataId);
  const nodeData = useNodeData(nodeDataId);
  const nodeIdsByDataId = useNodeIdsByDataId();
  const openWindow = useWindowsStore((s) => s.openWindow);
  const goToNode = useGoToNode();
  const { getNode } = useReactFlow();
  const [hoverOpen, setHoverOpen] = useState(false);

  const xyNodeId = nodeIdsByDataId.get(nodeDataId);
  const Icon = nodeData
    ? (NODE_TYPE_ICON_MAP[nodeData.type] ?? NODE_TYPE_ICON_MAP.title)
    : undefined;
  const label = title || nodeData?.type || "Node";

  const handleClick = () => {
    if (!nodeData || !xyNodeId || !getNode(xyNodeId)) return;
    const opened = openWindow({
      xyNodeId,
      nodeDataId,
      nodeType: nodeData.type,
    });
    if (!opened) goToNode(xyNodeId);
  };

  const row = (
    <button
      type="button"
      onClick={handleClick}
      onMouseEnter={() => snippet && setHoverOpen(true)}
      onMouseLeave={() => setHoverOpen(false)}
      disabled={!nodeData || !xyNodeId}
      title={!snippet ? label : undefined}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-accent/50",
        (!nodeData || !xyNodeId) && "cursor-not-allowed opacity-50",
      )}
    >
      {prefix && <span className="shrink-0 text-slate-400">{prefix}</span>}
      {Icon && <Icon className="size-4 shrink-0 text-slate-500" />}
      <span className="truncate">{label}</span>
    </button>
  );

  if (!snippet) return row;

  return (
    <Popover open={hoverOpen} onOpenChange={setHoverOpen}>
      <PopoverAnchor asChild>{row}</PopoverAnchor>
      <PopoverContent
        side="left"
        className="w-72 text-sm text-slate-600"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {snippet}
      </PopoverContent>
    </Popover>
  );
}
