import { TbLoader2 } from "react-icons/tb";
import type { ThreadNodeTouch } from "@/../convex/schemas/threadMetadataSchema";
import TaskNodePills from "@/components/canvas/on-canvas-ui/TaskNodePills";

/**
 * Le pied d'une carte de tâche, compatible avec n'importe quel corps : ce
 * que la tâche a touché sur le canvas (un clic y amène), et le travail
 * qu'elle a laissé en fond.
 */
export function TaskFooter({
  nodes,
  pending,
}: {
  nodes: readonly ThreadNodeTouch[];
  pending: number;
}) {
  if (nodes.length === 0 && pending === 0) return null;
  return (
    <div
      className="flex min-w-0 items-center gap-2 pl-7"
      onClick={(event) => event.stopPropagation()}
    >
      {nodes.length > 0 && (
        <div className="min-w-0 flex-1">
          <TaskNodePills touchedNodes={nodes} />
        </div>
      )}
      {pending > 0 && (
        <span className="flex shrink-0 items-center gap-1 text-[11px] text-slate-500">
          <TbLoader2 size={12} className="animate-spin text-violet-500" />
          {pending === 1 ? "1 task in the background" : `${pending} tasks in the background`}
        </span>
      )}
    </div>
  );
}
