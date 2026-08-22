import type { CSSProperties } from "react";
import { Link } from "@tanstack/react-router";
import { HiDotsVertical } from "react-icons/hi";
import { TbLayoutBoard, TbUsers } from "react-icons/tb";
import type { Id } from "@/../convex/_generated/dataModel";
import { Button } from "@/components/shadcn/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/shadcn/dropdown-menu";
import { formatDistanceToNow } from "@/lib/date-utils";
import { cn } from "@/lib/utils";

export interface WorkspaceCardCanvas {
  _id: Id<"canvases">;
  name: string;
  description?: string;
  updatedAt: number;
  nodeCount: number;
  shared?: boolean;
  permission?: "viewer" | "editor";
}

interface WorkspaceCardProps {
  canvas: WorkspaceCardCanvas;
  /** Absents sur les canvases partagés : on n'y a pas ces droits. */
  onEdit?: (canvas: WorkspaceCardCanvas) => void;
  onDelete?: (canvas: WorkspaceCardCanvas) => void;
  className?: string;
  style?: CSSProperties;
}

export default function WorkspaceCard({
  canvas,
  onEdit,
  onDelete,
  className,
  style,
}: WorkspaceCardProps) {
  const hasMenu = Boolean(onEdit || onDelete);

  return (
    <div
      className={cn(
        "group relative flex min-h-36 flex-col rounded-xl border border-gray-200 bg-white p-4 transition-colors hover:border-gray-300 hover:bg-gray-50/60",
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
        className="absolute inset-0 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--brand)"
        aria-label={`Open ${canvas.name}`}
      />

      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 flex-1 truncate font-medium text-gray-900">
          {canvas.name}
        </h3>

        {hasMenu && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Actions for ${canvas.name}`}
                // z-10 pour passer au-dessus du lien étiré, sans quoi le clic
                // ouvrirait le canvas au lieu du menu.
                className="relative z-10 h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
              >
                <HiDotsVertical size={14} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onEdit && (
                <DropdownMenuItem onClick={() => onEdit(canvas)}>
                  Edit
                </DropdownMenuItem>
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
        )}
      </div>

      {canvas.description && (
        <p className="mt-1.5 line-clamp-2 text-sm text-gray-500">
          {canvas.description}
        </p>
      )}

      <div className="mt-auto flex items-center gap-2 pt-4 text-xs text-gray-400">
        {canvas.shared ? (
          <TbUsers size={13} className="shrink-0" />
        ) : (
          <TbLayoutBoard size={13} className="shrink-0" />
        )}
        <span>
          {canvas.nodeCount} {canvas.nodeCount === 1 ? "block" : "blocks"}
        </span>
        <span aria-hidden>·</span>
        <span className="truncate">
          edited {formatDistanceToNow(new Date(canvas.updatedAt), {
            addSuffix: true,
          })}
        </span>
      </div>
    </div>
  );
}
