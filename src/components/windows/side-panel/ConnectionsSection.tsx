import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import { useNodeDataIdOf } from "@/lib/nodeIdentity";
import { NodeLinkRow } from "./NodeLinkRow";
import { SectionLabel } from "./SectionLabel";

function ConnectionRow({
  otherXyNodeId,
  prefix,
}: {
  otherXyNodeId: string;
  prefix: string;
}) {
  const nodeDataId = useNodeDataIdOf(otherXyNodeId);
  if (!nodeDataId) return null;
  return <NodeLinkRow nodeDataId={nodeDataId} prefix={prefix} />;
}

/** This node's canvas connections (edges), split by direction. */
export function ConnectionsSection({
  xyNodeId,
  canvasId,
}: {
  xyNodeId: string;
  canvasId: Id<"canvases">;
}) {
  const edges = useQuery(api.edges.listFromCanvas, { canvasId });

  const { incoming, outgoing } = useMemo(() => {
    const incoming: string[] = [];
    const outgoing: string[] = [];
    for (const edge of edges ?? []) {
      if (edge.status === "trashed") continue;
      if (edge.source === xyNodeId) outgoing.push(edge.target);
      else if (edge.target === xyNodeId) incoming.push(edge.source);
    }
    return { incoming, outgoing };
  }, [edges, xyNodeId]);

  const isLoading = edges === undefined;
  const isEmpty = !isLoading && incoming.length === 0 && outgoing.length === 0;

  return (
    <div className="flex flex-col gap-1">
      <SectionLabel hint="This node's connections (canvas edges) to other nodes.">
        Connections
      </SectionLabel>
      {isLoading ? (
        <div className="px-2 py-3 text-sm text-slate-400">Loading…</div>
      ) : isEmpty ? (
        <div className="px-2 py-3 text-sm text-slate-400">
          No connections yet.
        </div>
      ) : (
        <>
          {outgoing.map((id) => (
            <ConnectionRow key={`out-${id}`} otherXyNodeId={id} prefix="→" />
          ))}
          {incoming.map((id) => (
            <ConnectionRow key={`in-${id}`} otherXyNodeId={id} prefix="←" />
          ))}
        </>
      )}
    </div>
  );
}
