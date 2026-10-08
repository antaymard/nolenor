import { memo } from "react";
import { Link } from "@tanstack/react-router";
import {
  EMOJI_FONT_STYLE,
  canvasCover,
  canvasGlyph,
} from "@/lib/canvasCover";
import { cn } from "@/lib/utils";
import {
  CanvasTaskBadge,
  WorkspaceMenu,
  type WorkspaceItemProps,
} from "./WorkspaceCard";
import { CollaboratorStack } from "@/components/canvas/presence/CollaboratorStack";
import { formatBlocks } from "./workspaceFormat";

/**
 * Un canvas en ligne, pour la vue liste : plus dense que la grille, pour qui a
 * beaucoup de canvas et les retrouve par leur nom. Mémoïsée, comme la carte.
 */
function WorkspaceRow({
  canvas,
  onEdit,
  onDelete,
  pendingTasks,
  collaborators,
  className,
  style,
}: WorkspaceItemProps) {
  const cover = canvasCover(canvas.color);

  return (
    <li
      className={cn(
        "group relative flex h-14 items-center gap-3 border-b border-slate-100 bg-surface px-4 transition-colors last:border-b-0 hover:bg-slate-50",
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
          "flex size-8 shrink-0 items-center justify-center rounded-lg font-bold text-white",
          canvas.icon ? "text-base" : "text-sm",
          cover.tile,
        )}
        style={canvas.icon ? EMOJI_FONT_STYLE : undefined}
        aria-hidden
      >
        {canvasGlyph(canvas)}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">
        {canvas.name}
      </span>
      {/* `z-10` : au-dessus du lien étiré, pour que le survol montre les
          noms. */}
      <CollaboratorStack
        collaborators={collaborators}
        className="relative z-10 shrink-0"
      />
      <CanvasTaskBadge tasks={pendingTasks} className="shadow-none" />
      <span className="w-20 shrink-0 text-xs text-slate-500 max-sm:hidden">
        {canvas.shared ? "Shared" : "Yours"}
      </span>
      <span className="w-20 shrink-0 text-xs text-slate-500 max-md:hidden">
        {formatBlocks(canvas.nodeCount)}
      </span>
      <WorkspaceMenu canvas={canvas} onEdit={onEdit} onDelete={onDelete} />
    </li>
  );
}

export default memo(WorkspaceRow);
