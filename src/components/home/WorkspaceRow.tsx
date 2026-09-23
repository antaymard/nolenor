import { Link } from "@tanstack/react-router";
import { canvasCover, canvasInitial } from "@/lib/canvasCover";
import { cn } from "@/lib/utils";
import {
  CanvasTaskBadge,
  WorkspaceMenu,
  type WorkspaceItemProps,
} from "./WorkspaceCard";
import { formatBlocks, formatEdited } from "./workspaceFormat";

/**
 * Un canvas en ligne, pour la vue liste : plus dense que la grille, pour qui a
 * beaucoup de canvas et les retrouve par leur nom.
 */
export default function WorkspaceRow({
  canvas,
  onEdit,
  onDelete,
  pendingTasks,
  className,
  style,
}: WorkspaceItemProps) {
  const cover = canvasCover(canvas._id);

  return (
    <li
      className={cn(
        "group relative flex h-14 items-center gap-3 border-b border-slate-100 bg-white px-4 transition-colors last:border-b-0 hover:bg-slate-50",
        className,
      )}
      style={style}
    >
      {/* Même lien étiré que la carte, pour la même raison. */}
      <Link
        to="/canvas/$canvasId"
        params={{ canvasId: canvas._id }}
        className="absolute inset-0 z-[1] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--brand)"
        aria-label={`Open ${canvas.name}`}
      />

      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white",
          cover.tile,
        )}
        aria-hidden
      >
        {canvasInitial(canvas.name)}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">
        {canvas.name}
      </span>
      <CanvasTaskBadge tasks={pendingTasks} className="shadow-none" />
      <span className="w-20 shrink-0 text-xs text-slate-500 max-sm:hidden">
        {canvas.shared ? "Shared" : "Yours"}
      </span>
      <span className="w-20 shrink-0 text-xs text-slate-500 max-md:hidden">
        {formatBlocks(canvas.nodeCount)}
      </span>
      <span className="w-40 shrink-0 truncate text-right text-xs text-slate-500 max-sm:hidden">
        {formatEdited(canvas.updatedAt)}
      </span>
      <WorkspaceMenu canvas={canvas} onEdit={onEdit} onDelete={onDelete} />
    </li>
  );
}
