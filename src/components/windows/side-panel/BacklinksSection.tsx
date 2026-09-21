import { useMemo } from "react";
import type { Id } from "@/../convex/_generated/dataModel";
import { useNodeDataStore } from "@/stores/nodeDataStore";
import { findBacklinks } from "@/lib/nodeBacklinks";
import { NodeLinkRow } from "./NodeLinkRow";

/**
 * Nodes referencing this one — `@mention` pills and table node/richtext
 * columns. Computed once on mount (i.e. each time the Links tab is opened,
 * since it only mounts then) from the canvas's already-loaded nodeDatas, not
 * a live subscription — reopening the tab refreshes it.
 */
export function BacklinksSection({
  nodeDataId,
  xyNodeId,
}: {
  nodeDataId: Id<"nodeDatas">;
  xyNodeId: string;
}) {
  const backlinks = useMemo(
    () => findBacklinks(nodeDataId, xyNodeId, useNodeDataStore.getState().nodeDatas),
    [nodeDataId, xyNodeId],
  );

  return (
    <div className="flex flex-col gap-1">
      <div className="px-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Backlinks
      </div>
      {backlinks.length === 0 ? (
        <div className="px-2 py-3 text-sm text-slate-400">
          No node mentions this one yet.
        </div>
      ) : (
        backlinks.map((backlink, index) => (
          <NodeLinkRow
            key={`${backlink.sourceNodeDataId}-${index}`}
            nodeDataId={backlink.sourceNodeDataId}
            snippet={backlink.snippet || undefined}
          />
        ))
      )}
    </div>
  );
}
