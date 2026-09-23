import type { CSSProperties } from "react";
import { Link } from "@tanstack/react-router";
import { HiDotsVertical } from "react-icons/hi";
import { TbUsers } from "react-icons/tb";
import type { Id } from "@/../convex/_generated/dataModel";
import { Button } from "@/components/shadcn/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/shadcn/dropdown-menu";
import {
  CANVAS_COVER_DOTS_STYLE,
  canvasCover,
  canvasInitial,
} from "@/lib/canvasCover";
import {
  getDockStatusAppearance,
  pickDominantRunStatus,
  resolveRunStatus,
  type HomePendingThread,
} from "@/lib/threadRunStatus";
import { cn } from "@/lib/utils";
import { formatBlocks, formatEdited } from "./workspaceFormat";

export interface WorkspaceCardCanvas {
  _id: Id<"canvases">;
  name: string;
  description?: string;
  updatedAt: number;
  nodeCount: number;
  shared?: boolean;
  permission?: "viewer" | "editor";
}

export interface WorkspaceItemProps {
  canvas: WorkspaceCardCanvas;
  /** Absents sur les canvases partagés : on n'y a pas ces droits. */
  onEdit?: (canvas: WorkspaceCardCanvas) => void;
  onDelete?: (canvas: WorkspaceCardCanvas) => void;
  /** Ce que Nolë y a laissé en plan, résumé en une pastille. Le détail est
   *  dans la liste des tâches, au-dessus — ici on signale, on ne raconte pas. */
  pendingTasks: HomePendingThread[];
  className?: string;
  style?: CSSProperties;
}

/**
 * La pastille des tâches d'un canvas : un compte, et la couleur de la plus
 * urgente (cf. `pickDominantRunStatus`). Pas de minuterie : une carte qui met
 * un rendu à passer du violet à l'ambre ne trompe personne.
 */
export function CanvasTaskBadge({
  tasks,
  className,
}: {
  tasks: HomePendingThread[];
  className?: string;
}) {
  if (tasks.length === 0) return null;

  const now = Date.now();
  const status = pickDominantRunStatus(
    tasks.map((task) => resolveRunStatus(task, now)),
  );
  const appearance = getDockStatusAppearance(status);

  return (
    <span
      title={appearance.description}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200",
        className,
      )}
    >
      <span
        className={cn(
          "size-2 rounded-full",
          appearance.dotClassName,
          status === "running" && "animate-pulse",
        )}
      />
      {tasks.length} {tasks.length === 1 ? "task" : "tasks"}
    </span>
  );
}

/**
 * Le menu Edit / Delete d'un canvas à soi. `z-10` pour passer au-dessus du lien
 * étiré de la carte, sans quoi le clic ouvrirait le canvas au lieu du menu.
 */
export function WorkspaceMenu({
  canvas,
  onEdit,
  onDelete,
  className,
}: Pick<WorkspaceItemProps, "canvas" | "onEdit" | "onDelete"> & {
  className?: string;
}) {
  if (!onEdit && !onDelete) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Actions for ${canvas.name}`}
          className={cn(
            "relative z-10 size-7 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 max-md:opacity-100",
            className,
          )}
        >
          <HiDotsVertical size={14} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {onEdit && (
          <DropdownMenuItem onClick={() => onEdit(canvas)}>Edit</DropdownMenuItem>
        )}
        {onDelete && (
          <DropdownMenuItem
            onClick={() => onDelete(canvas)}
            className="text-destructive"
          >
            Delete
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Un canvas en carte, pour la vue grille. */
export default function WorkspaceCard({
  canvas,
  onEdit,
  onDelete,
  pendingTasks,
  className,
  style,
}: WorkspaceItemProps) {
  const cover = canvasCover(canvas._id);

  return (
    <div
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white transition-[box-shadow,transform,border-color] hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md",
        className,
      )}
      style={style}
    >
      {/* Lien étiré sur toute la carte plutôt que carte enroulée dans un
          lien : un <button> de menu à l'intérieur d'un <a> n'est pas du HTML
          valide, et le menu devient inatteignable au clavier. */}
      <Link
        to="/canvas/$canvasId"
        params={{ canvasId: canvas._id }}
        className="absolute inset-0 z-[1] rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--brand)"
        aria-label={`Open ${canvas.name}`}
      />

      <div
        className={cn("relative flex h-24 items-end p-3", cover.tint)}
        style={CANVAS_COVER_DOTS_STYLE}
      >
        <span
          className={cn(
            "flex size-9 items-center justify-center rounded-xl text-base font-bold text-white shadow-sm",
            cover.tile,
          )}
          aria-hidden
        >
          {canvasInitial(canvas.name)}
        </span>
        <CanvasTaskBadge
          tasks={pendingTasks}
          className="absolute top-2.5 right-2.5"
        />
      </div>

      <div className="flex flex-1 flex-col gap-1 px-3.5 pt-3 pb-3.5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="min-w-0 flex-1 truncate text-[15px] font-bold text-slate-900">
            {canvas.name}
          </h3>
          <WorkspaceMenu
            canvas={canvas}
            onEdit={onEdit}
            onDelete={onDelete}
            className="-my-1 -mr-1.5"
          />
        </div>
        {canvas.description && (
          <p className="line-clamp-2 text-xs text-slate-500">
            {canvas.description}
          </p>
        )}
        <p className="mt-auto flex items-center gap-1.5 pt-1 text-xs text-slate-500">
          {canvas.shared && (
            <>
              <TbUsers className="size-3.5 shrink-0" />
              <span className="font-medium text-slate-600">Shared</span>
              <span aria-hidden>·</span>
            </>
          )}
          <span className="truncate">
            {formatBlocks(canvas.nodeCount)} · {formatEdited(canvas.updatedAt)}
          </span>
        </p>
      </div>
    </div>
  );
}
