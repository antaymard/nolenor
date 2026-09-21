import type { Id } from "@/../convex/_generated/dataModel";
import AssociatedThreadsViewer from "@/components/windows/AssociatedThreadsViewer";
import { BacklinksSection } from "./BacklinksSection";
import { ConnectionsSection } from "./ConnectionsSection";

/**
 * Backlinks, canvas connections, and the Nolë threads that edited this node —
 * all lazy: this whole tab only mounts (and only then queries/scans anything)
 * once the user opens it, via Radix Tabs' default unmount-when-inactive.
 */
export function LinksTab({
  nodeDataId,
  xyNodeId,
  canvasId,
}: {
  nodeDataId: Id<"nodeDatas">;
  xyNodeId: string;
  canvasId: Id<"canvases">;
}) {
  return (
    <div className="flex flex-col gap-4 p-2">
      <BacklinksSection nodeDataId={nodeDataId} xyNodeId={xyNodeId} />
      <ConnectionsSection xyNodeId={xyNodeId} canvasId={canvasId} />
      <div className="flex flex-col gap-1">
        <div className="px-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Threads
        </div>
        <div className="flex min-h-48 flex-col px-2">
          <AssociatedThreadsViewer nodeDataId={nodeDataId} />
        </div>
      </div>
    </div>
  );
}
