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
const KIND_SECTIONS: { kind: ThreadNodeTouch["kind"]; label: string }[] = [
  { kind: "created", label: "Créés" },
  { kind: "updated", label: "Modifiés" },
  { kind: "deleted", label: "Supprimés" },
];

/**
 * Ce que la tâche a touché, groupé par verbe. Affiché au survol d'une pastille
 * du dock.
 */
export default function ActivityDockNodes({
  touchedNodes,
}: {
  touchedNodes: readonly ThreadNodeTouch[];
}) {
  const goToNode = useGoToNode();
  const nodeIds = useNodeIdsByDataId(
    touchedNodes.map((touch) => touch.nodeDataId),
  );

  if (touchedNodes.length === 0) {
    return (
      <p className="text-xs text-slate-400">
        Cette tâche n&apos;a modifié aucun node.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {KIND_SECTIONS.map(({ kind, label }) => {
        const section = touchedNodes.filter((touch) => touch.kind === kind);
        if (section.length === 0) return null;

        return (
          <div key={kind} className="flex flex-col gap-0.5">
            <p className="px-1 text-[10px] font-medium tracking-wide text-slate-400 uppercase">
              {label}
            </p>
            {section.map((touch) => (
              <DockNodeRow
                key={touch.nodeDataId}
                touch={touch}
                xyNodeId={nodeIds.get(touch.nodeDataId)}
                onNavigate={goToNode}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Une ligne de node.
 *
 * Non cliquable dans deux cas, et affichée quand même dans les deux : le node
 * a été supprimé par la tâche — « Nolë a supprimé ça » mérite d'être lu, pas
 * escamoté —, ou il a disparu du canvas depuis, hors de toute trace du thread.
 * La résolution vers un id React Flow sert alors de filtre, comme
 * `MinimizedWindowsStack` avec ses `existingNodeIds`.
 */
function DockNodeRow({
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
      onClick={() => {
        if (xyNodeId) onNavigate(xyNodeId);
      }}
      title={canNavigate ? "Aller au node" : undefined}
      className={cn(
        "flex w-full items-center gap-2 rounded px-1 py-1 text-left text-sm",
        canNavigate
          ? "text-slate-700 hover:bg-slate-100"
          : "cursor-default text-slate-400",
        touch.kind === "deleted" && "line-through",
      )}
    >
      {NodeIcon ? <NodeIcon className="size-3.5 shrink-0" /> : null}
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  );
}
