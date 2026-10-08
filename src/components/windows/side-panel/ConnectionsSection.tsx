import { useMemo } from "react";
import { useQuery } from "convex/react";
import { TbArrowLeftFromArc, TbArrowRightToArc } from "react-icons/tb";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import { useNodeDataIdOf } from "@/lib/nodeIdentity";
import { NodeLinkRow } from "./NodeLinkRow";
import { SectionLabel } from "./SectionLabel";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/shadcn/tooltip";

function ConnectionRow({
  otherXyNodeId,
  direction,
}: {
  otherXyNodeId: string;
  direction: "incoming" | "outgoing";
}) {
  const nodeDataId = useNodeDataIdOf(otherXyNodeId);
  if (!nodeDataId) return null;
  const DirectionIcon =
    direction === "incoming" ? TbArrowRightToArc : TbArrowLeftFromArc;
  const tooltip =
    direction === "incoming"
      ? "Source — this block points to the current block"
      : "Target — the current block points to this block";
  return (
    <NodeLinkRow
      nodeDataId={nodeDataId}
      prefix={
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="flex shrink-0 text-slate-400">
              <DirectionIcon size={16} />
            </span>
          </TooltipTrigger>
          <TooltipContent side="left">{tooltip}</TooltipContent>
        </Tooltip>
      }
    />
  );
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
            <ConnectionRow
              key={`out-${id}`}
              otherXyNodeId={id}
              direction="outgoing"
            />
          ))}
          {incoming.map((id) => (
            <ConnectionRow
              key={`in-${id}`}
              otherXyNodeId={id}
              direction="incoming"
            />
          ))}
        </>
      )}
    </div>
  );
}
