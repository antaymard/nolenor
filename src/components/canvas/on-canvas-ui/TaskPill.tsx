import type { ThreadNodeTouch } from "@/../convex/schemas/threadMetadataSchema";
import { getNodeIcon } from "@/components/utils/nodeDataDisplayUtils";
import { useNodeData } from "@/hooks/useNodeData";
import { useNodeDataTitle } from "@/hooks/useNodeTitle";
import {
  getTaskPillLabel,
  type PendingThread,
  type RunStatusAppearance,
} from "@/lib/threadRunStatus";
import { cn } from "@/lib/utils";

/**
 * Le contenu d'une pastille de tâche, partagé par le dock et les marqueurs du
 * canvas.
 *
 * Trois fentes, toujours dans cet ordre : **le statut** (le point), **le node**
 * (au dock seulement) et **la dernière action**.
 *
 * Les deux surfaces disaient la même tâche avec des libellés différents — le
 * titre du node au dock, celui du thread sur le canvas — ce qui obligeait à
 * relire deux fois pour reconnaître une seule tâche. Le partage tient à la
 * séparation des fentes : l'identité du node a désormais sa propre place
 * visuelle au lieu de disputer le libellé, qui revient à ce que Nolë est en
 * train de faire. Reste au canvas la seule différence qui se justifie — le node
 * y est déjà sous la pastille, la puce n'y apprendrait rien.
 */
export default function TaskPillBody({
  thread,
  appearance,
  isRunning,
  showNodeChip = false,
}: {
  thread: PendingThread;
  appearance: RunStatusAppearance;
  isRunning: boolean;
  /** Le dock l'affiche, le canvas non : là-bas le node est sous la pastille. */
  showNodeChip?: boolean;
}) {
  return (
    <>
      {/* Un point qui pulse, et non l'orbe : à cette taille elle serait
          illisible, et elle reste la signature de l'overlay live au bas de la
          conversation — la répéter ici la banaliserait. */}
      <span
        aria-hidden
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          appearance.dotClassName,
          isRunning && "animate-pulse",
        )}
      />
      {showNodeChip ? <TaskNodeChip touchedNodes={thread.touchedNodes} /> : null}
      <span className="min-w-0 flex-1 truncate">{getTaskPillLabel(thread)}</span>
    </>
  );
}

/**
 * Où la tâche travaille, en une puce.
 *
 * Le fond en noir translucide plutôt qu'une teinte fixe : la puce se pose sur
 * les quatre couleurs de statut, et un `bg-black/5` les assombrit toutes du même
 * cran au lieu d'en jurer avec trois.
 */
function TaskNodeChip({
  touchedNodes,
}: {
  touchedNodes: readonly ThreadNodeTouch[];
}) {
  // Le node touché en premier porte l'icône : c'est celui par lequel la tâche a
  // commencé, donc le plus probable point de repère.
  const first = touchedNodes[0];
  const singleTitle = useNodeDataTitle(
    touchedNodes.length === 1 ? first?.nodeDataId : undefined,
  );
  const nodeData = useNodeData(first?.nodeDataId);
  const NodeIcon = getNodeIcon(nodeData?.type);

  // Rien touché : un tour qui démarre, ou une tâche de pure lecture. Pas de
  // puce vide — l'absence dit déjà « nulle part en particulier ».
  if (!first) return null;

  const createdCount = touchedNodes.filter(
    (touch) => touch.kind === "created",
  ).length;

  const label =
    touchedNodes.length === 1
      ? (singleTitle ?? "Sans titre")
      : // « 3 créés » l'emporte sur « 5 nodes » : c'est la création qui appelle
        // un coup d'œil.
        createdCount > 0
        ? `${createdCount} créé${createdCount > 1 ? "s" : ""}`
        : `${touchedNodes.length} nodes`;

  return (
    <span className="flex max-w-[90px] shrink-0 items-center gap-1 rounded bg-black/5 px-1 py-0.5 text-[10px] leading-none">
      {NodeIcon ? <NodeIcon className="size-2.5 shrink-0" /> : null}
      <span className="min-w-0 truncate">{label}</span>
    </span>
  );
}
