import { useRef } from "react";
import { Panel, type Edge } from "@xyflow/react";
import type { Id } from "@/../convex/_generated/dataModel";
import type { CanvasNode } from "@/types/convex";
import CanvasFlow from "@/components/canvas/CanvasFlow";
import MobileCanvasToolbar from "./MobileCanvasToolbar";

export default function MobileCanvasTab({
  canvasId,
  canvasNodes,
  canvasEdges,
  canEdit,
}: {
  canvasId: Id<"canvases">;
  canvasNodes: CanvasNode[] | undefined;
  canvasEdges: Edge[] | undefined;
  canEdit: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div ref={containerRef} className="h-full w-full">
      <CanvasFlow
        canvasId={canvasId}
        canvasNodes={canvasNodes}
        canvasEdges={canvasEdges}
        canEdit={canEdit}
        variant="touch"
      >
        {canEdit ? (
          <Panel position="bottom-center">
            <MobileCanvasToolbar containerRef={containerRef} />
          </Panel>
        ) : null}
      </CanvasFlow>
    </div>
  );
}
