import { memo } from "react";
import {
  collaboratorLabel,
  useCanvasPresenceStore,
} from "@/stores/canvasPresenceStore";
import { CollaboratorAvatar } from "@/components/canvas/presence/CollaboratorAvatar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/shadcn/tooltip";

// Facepile des AUTRES membres présents sur le canvas, à côté du statut de
// synchro. Soi-même n'y figure pas : on sait qu'on est là. La présence
// elle-même est tenue par `CanvasPresenceSync` (monté par `CanvasFlow`).

const MAX_VISIBLE = 3;

function CanvasPresence() {
  const collaborators = useCanvasPresenceStore((state) => state.collaborators);

  if (collaborators.length === 0) return null;

  const visible = collaborators.slice(0, MAX_VISIBLE);
  const hidden = collaborators.slice(MAX_VISIBLE);

  return (
    <div className="flex items-center -space-x-1.5">
      {visible.map((collaborator) => (
        <Tooltip key={collaborator.userId}>
          <TooltipTrigger asChild>
            <CollaboratorAvatar
              collaborator={collaborator}
              className="ring-surface size-6 text-[11px] ring-2"
            />
          </TooltipTrigger>
          <TooltipContent>{collaboratorLabel(collaborator)}</TooltipContent>
        </Tooltip>
      ))}
      {hidden.length > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="ring-surface flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground ring-2">
              +{hidden.length}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            {hidden.map(collaboratorLabel).join(", ")}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

export default memo(CanvasPresence);
