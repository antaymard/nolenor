import { NodeToolbar, Position, type Node, useStore } from "@xyflow/react";
import type { XyNodeProps } from "@/types/domain";
import { memo } from "react";

const selectedNodesCountSelector = (state: { nodes: Node[] }) =>
  state.nodes.filter((node) => node.selected).length;

interface CanvasNodeToolbarProps {
  children?: React.ReactNode;
  xyNode: XyNodeProps;
  className?: string;
  asSimpleDiv?: boolean;
  /**
   * Le bord du node où la barre se pose. Au-dessus par défaut, comme React
   * Flow — sauf pour un node qui a déjà quelque chose là (le titre d'une
   * frame, posé sur son bord haut).
   */
  position?: Position;
}

function CanvasNodeToolbar({
  children,
  xyNode,
  className = "",
  asSimpleDiv = false,
  position = Position.Top,
}: CanvasNodeToolbarProps) {
  // Early return si le node n'est pas sélectionné — aucun hook avant ce point
  // pour éviter que les nodes non-sélectionnés souscrivent au store global
  if (!xyNode.selected && !asSimpleDiv) {
    return null;
  }

  return (
    <ToolbarContent
      xyNode={xyNode}
      className={className}
      asSimpleDiv={asSimpleDiv}
      position={position}
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
  position = Position.Top,
}: CanvasNodeToolbarProps) {
  const selectedNodesCount = useStore(selectedNodesCountSelector);

  const isVisible = !xyNode.dragging && selectedNodesCount === 1;

  const content = <>{children}</>;

  if (asSimpleDiv) return <div className="flex gap-2">{content}</div>;

  return (
    <NodeToolbar
      onContextMenu={(e) => e.stopPropagation()}
      isVisible={isVisible}
      position={position}
      offset={12}
      className={`canvas-ui-container gap-1! px-1.5! py-1! shadow-lg ${className}`}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      {content}
    </NodeToolbar>
  );
}

export default memo(CanvasNodeToolbar);
