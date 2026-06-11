import { NodeToolbar, type Node, useStore } from "@xyflow/react";
import { memo } from "react";

const selectedNodesCountSelector = (state: { nodes: Node[] }) =>
  state.nodes.filter((node) => node.selected).length;

interface CanvasNodeToolbarProps {
  children?: React.ReactNode;
  xyNode: Node;
  className?: string;
  asSimpleDiv?: boolean;
}

function CanvasNodeToolbar({
  children,
  xyNode,
  className = "",
  asSimpleDiv = false,
}: CanvasNodeToolbarProps) {
  // Early return si le node n'est pas sélectionné — aucun hook avant ce point
  // pour éviter que les nodes non-sélectionnés souscrivent au store global
  if (!xyNode?.selected && !asSimpleDiv) {
    return null;
  }

  return (
    <ToolbarContent
      xyNode={xyNode}
      className={className}
      asSimpleDiv={asSimpleDiv}
    >
      {children}
    </ToolbarContent>
  );
}

function ToolbarContent({
  children,
  xyNode,
  className = "",
  asSimpleDiv = false,
}: CanvasNodeToolbarProps) {
  const selectedNodesCount = useStore(selectedNodesCountSelector);

  const isVisible = !xyNode.dragging && selectedNodesCount === 1;

  const content = <>{children}</>;

  if (asSimpleDiv) return <div className="flex gap-2">{content}</div>;

  return (
    <NodeToolbar
      onContextMenu={(e) => e.stopPropagation()}
      isVisible={isVisible}
      className={`flex gap-2 ${className}`}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      {content}
    </NodeToolbar>
  );
}

export default memo(CanvasNodeToolbar);
