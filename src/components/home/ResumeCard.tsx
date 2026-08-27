import { Link } from "@tanstack/react-router";
import { TbArrowRight } from "react-icons/tb";
import type { Id } from "@/../convex/_generated/dataModel";
import { formatDistanceToNow } from "@/lib/date-utils";
import type { HomePendingThread } from "@/lib/threadRunStatus";
import { PendingTaskList } from "./PendingTasks";

interface ResumeCardProps {
  canvas: {
    _id: Id<"canvases">;
    name: string;
    description?: string;
    updatedAt: number;
    nodeCount: number;
  };
  /** Ce que Nolë y a laissé en plan. Le détail vit ici et nulle part ailleurs
   *  sur la page : c'est la carte où l'on reprend le travail. */
  pendingTasks: HomePendingThread[];
}

/**
 * Le raccourci vers le dernier canvas touché — ce que `/` faisait
 * automatiquement avant d'être une page. On le propose au lieu de l'imposer.
 */
export default function ResumeCard({ canvas, pendingTasks }: ResumeCardProps) {
  return (
    // Lien étiré plutôt que carte enroulée dans un lien, depuis que les tâches
    // en attente s'affichent ici : chacune est un lien vers sa conversation, et
    // un <a> dans un <a> n'est pas du HTML valide (même raison que
    // `WorkspaceCard` avec son menu).
    <div className="group relative flex flex-col rounded-xl border border-gray-200 bg-white p-5 transition-colors hover:border-(--brand)/40 hover:bg-gray-50/60">
      <Link
        to="/canvas/$canvasId"
        params={{ canvasId: canvas._id }}
        className="absolute inset-0 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--brand)"
        aria-label={`Open ${canvas.name}`}
      />

      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-medium tracking-wide text-(--brand) uppercase">
            Pick up where you left off
          </p>
          <h2 className="mt-1 truncate text-lg font-semibold text-gray-900">
            {canvas.name}
          </h2>
          <p className="mt-0.5 truncate text-sm text-gray-500">
            {canvas.nodeCount} {canvas.nodeCount === 1 ? "block" : "blocks"} ·
            edited{" "}
            {formatDistanceToNow(new Date(canvas.updatedAt), {
              addSuffix: true,
            })}
          </p>
        </div>

        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-600 transition-colors group-hover:bg-(--brand) group-hover:text-white">
          <TbArrowRight size={18} />
        </span>
      </div>

      {pendingTasks.length > 0 && (
        <div className="mt-4 border-t border-gray-100 pt-3">
          <PendingTaskList canvasId={canvas._id} tasks={pendingTasks} />
        </div>
      )}
    </div>
  );
}
