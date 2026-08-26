import type { ThreadNodeTouch } from "@/../convex/schemas/threadMetadataSchema";
import { getNodeIcon } from "@/components/utils/nodeDataDisplayUtils";
import { useGoToNode } from "@/hooks/useGoToNode";
import { useNodeData } from "@/hooks/useNodeData";
import { useNodeDataTitle } from "@/hooks/useNodeTitle";
import { useNodeIdsByDataId } from "@/lib/nodeIdentity";
import { cn } from "@/lib/utils";

/**
 * Les créés d'abord : c'est ce qu'on cherche des yeux après avoir demandé
 * quelque chose à Nolë. Les supprimés en dernier, ils ne se visitent pas.
 */
const KIND_ORDER: Record<ThreadNodeTouch["kind"], number> = {
  created: 0,
  updated: 1,
  deleted: 2,
};

/** Au-delà, la place manque : le reste passe derrière un compteur. */
const MAX_VISIBLE = 2;

/**
 * Les nodes qu'une tâche travaille, en pastilles cliquables.
 *
 * Elles vivaient dans un popover de survol, parce que le bloc d'alors n'avait
 * qu'une ligne. Elles sont maintenant la première ligne du bloc : c'est le
 * repère qu'on cherche en premier — *où* ça se passe — et le cacher derrière un
 * survol le rendait inatteignable au coup d'œil.
 */
export default function TaskNodePills({
  touchedNodes,
}: {
  touchedNodes: readonly ThreadNodeTouch[];
}) {
  const goToNode = useGoToNode();
  const nodeIds = useNodeIdsByDataId();

  const sorted = [...touchedNodes].sort(
    (a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind],
  );
  const visible = sorted.slice(0, MAX_VISIBLE);
  const hiddenCount = sorted.length - visible.length;

  return (
    <div className="flex min-w-0 items-center gap-1">
      {visible.map((touch) => (
        <NodePill
          key={touch.nodeDataId}
          touch={touch}
          xyNodeId={nodeIds.get(touch.nodeDataId)}
          onNavigate={goToNode}
        />
      ))}
      {hiddenCount > 0 ? (
        <span className="shrink-0 text-[10px] text-slate-400">
          +{hiddenCount}
        </span>
      ) : null}
    </div>
  );
}

/**
 * Une pastille de node.
 *
 * Non cliquable dans deux cas, affichée quand même dans les deux : le node a
 * été supprimé par la tâche — « Nolë a supprimé ça » mérite d'être lu, pas
 * escamoté —, ou il a disparu du canvas depuis. La résolution vers un id React
 * Flow sert de filtre, comme `MinimizedWindowsStack` avec ses `existingNodeIds`.
 *
 * Le `stopPropagation` est ce qui sépare les deux gestes du bloc : la pastille
 * emmène au node, le reste du bloc ouvre la conversation.
 */
function NodePill({
  touch,
  xyNodeId,
  onNavigate,
}: {
  touch: ThreadNodeTouch;
  xyNodeId: string | undefined;
  onNavigate: (xyNodeId: string) => void;
}) {
  const title = useNodeDataTitle(touch.nodeDataId);
  const nodeData = useNodeData(touch.nodeDataId);
  const NodeIcon = getNodeIcon(nodeData?.type);
  const canNavigate = xyNodeId !== undefined && touch.kind !== "deleted";

  const label =
    title ?? (touch.kind === "deleted" ? "Node supprimé" : "Sans titre");

  return (
    <button
      type="button"
      disabled={!canNavigate}
      onClick={(event) => {
        event.stopPropagation();
        if (xyNodeId) onNavigate(xyNodeId);
      }}
      title={canNavigate ? `Aller à « ${label} »` : label}
      className={cn(
        "flex min-w-0 max-w-[132px] shrink items-center gap-1 rounded",
        "bg-slate-100 px-1.5 py-0.5 text-[10px] leading-none text-slate-600",
        canNavigate ? "hover:bg-slate-200" : "cursor-default opacity-55",
        touch.kind === "deleted" && "line-through",
      )}
    >
      {NodeIcon ? <NodeIcon className="size-2.5 shrink-0" /> : null}
      <span className="min-w-0 truncate">{label}</span>
    </button>
  );
}
