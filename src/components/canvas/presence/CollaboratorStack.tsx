import { TbAppWindowFilled, TbPointerFilled } from "react-icons/tb";
import {
  collaboratorColor,
  collaboratorLabel,
  type Collaborator,
  type NodeCollaborator,
} from "@/stores/canvasPresenceStore";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/shadcn/tooltip";
import { cn } from "@/lib/utils";
import { CollaboratorAvatar } from "./CollaboratorAvatar";

// Même pile que la facepile du canvas (CanvasPresence) : 3 pastilles, puis +N.
const MAX_VISIBLE = 3;

type StackedCollaborator = Collaborator & {
  activity?: NodeCollaborator["activity"];
};

/**
 * Une pile de pastilles de collaborateurs, les noms au survol : sur les nodes
 * (cf. NodeCollaboratorsPill) et sur les canvas de la home.
 *
 * Avec une `activity`, une pastille `open` porte un anneau à la couleur du
 * collaborateur (node ouvert en window) et l'infobulle dit ce que fait chacun.
 * Les premières pastilles passent au-dessus des suivantes : l'appelant met en
 * tête celles dont l'anneau doit rester entier.
 */
export function CollaboratorStack({
  collaborators,
  className,
}: {
  collaborators: StackedCollaborator[];
  className?: string;
}) {
  if (collaborators.length === 0) return null;

  const visible = collaborators.slice(0, MAX_VISIBLE);
  const hidden = collaborators.length - visible.length;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          // Chevauchement plus court que la facepile (-space-x-1.5) : l'anneau
          // déborde de la pastille et mangerait sinon la lettre de la voisine.
          className={cn("flex items-center -space-x-1", className)}
          aria-label={collaborators.map(collaboratorLabel).join(", ")}
        >
          {visible.map((collaborator, index) => (
            <CollaboratorAvatar
              key={collaborator.userId}
              collaborator={collaborator}
              className="ring-surface relative size-5 text-[10px] ring-2"
              style={{
                zIndex: visible.length - index,
                ...(collaborator.activity === "open"
                  ? {
                      // Anneau « actif » : surface, couleur, surface.
                      boxShadow: `0 0 0 1px var(--color-surface), 0 0 0 2.5px ${collaboratorColor(collaborator.userId)}, 0 0 0 3.5px var(--color-surface)`,
                    }
                  : {}),
              }}
            />
          ))}
          {hidden > 0 && (
            <span className="ring-surface flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[9px] font-semibold text-muted-foreground ring-2">
              +{hidden}
            </span>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="flex flex-col gap-1">
        {collaborators.map((collaborator) => (
          <span
            key={collaborator.userId}
            className="flex items-center gap-1.5"
          >
            {collaborator.activity === "open" && (
              <TbAppWindowFilled size={12} className="shrink-0" />
            )}
            {collaborator.activity === "selected" && (
              <TbPointerFilled size={12} className="shrink-0" />
            )}
            <span className="font-medium">
              {collaboratorLabel(collaborator)}
            </span>
            {collaborator.activity && (
              <span className="opacity-70">
                {collaborator.activity === "open"
                  ? "has it open"
                  : "selected it"}
              </span>
            )}
          </span>
        ))}
      </TooltipContent>
    </Tooltip>
  );
}
