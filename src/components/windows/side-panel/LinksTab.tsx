import type { Id } from "@/../convex/_generated/dataModel";
import { BacklinksSection } from "./BacklinksSection";
import { ConnectionsSection } from "./ConnectionsSection";
import { ThreadsSection } from "./ThreadsSection";

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
      <ThreadsSection nodeDataId={nodeDataId} />
    </div>
  );
}
