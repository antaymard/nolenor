import { memo } from "react";
import { TbAppWindowFilled, TbPointerFilled } from "react-icons/tb";
import {
  collaboratorColor,
  collaboratorLabel,
  useNodeCollaborators,
  type NodeCollaborator,
} from "@/stores/canvasPresenceStore";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/shadcn/tooltip";
import { CollaboratorAvatar } from "./CollaboratorAvatar";

// Même pile que la facepile du canvas (CanvasPresence) : 3 pastilles, puis +N.
const MAX_VISIBLE = 3;

/**
 * Ceux qui ont le node ouvert d'abord : ils passent au-dessus de leurs
 * voisines dans la pile, leur anneau reste entier.
 */
function byActivity(a: NodeCollaborator, b: NodeCollaborator): number {
  if (a.activity === b.activity) return 0;
  return a.activity === "open" ? -1 : 1;
}

/**
 * Qui d'autre est sur ce node : une pile de pastilles dans son coin bas-droit.
 * Une pastille cerclée d'un anneau à sa couleur : le collaborateur a le node
 * ouvert en window ; sans anneau : il l'a seulement sélectionné. Les noms
 * s'affichent au survol. Pas de liseré ni de ring sur le node — le ring
 * reste le signal de SA propre sélection.
 *
 * Se rend dans le conteneur interne du node (positionné, `overflow-hidden`) :
 * elle est visuellement dans le node. Sans `nodrag` : un drag ou un
 * double-clic qui part des pastilles remonte au node comme ailleurs.
 */
function NodeCollaboratorsPill({ nodeId }: { nodeId: string }) {
  const collaborators = useNodeCollaborators(nodeId);
  if (!collaborators || collaborators.length === 0) return null;

  const sorted = [...collaborators].sort(byActivity);
  const visible = sorted.slice(0, MAX_VISIBLE);
  const hidden = sorted.length - visible.length;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          // Chevauchement plus court que la facepile (-space-x-1.5) : l'anneau
          // déborde de la pastille et mangerait sinon la lettre de la voisine.
          className="absolute right-2 bottom-2 z-20 flex items-center -space-x-1"
          aria-label={sorted
            .map(
              (c) =>
                `${collaboratorLabel(c)} (${c.activity === "open" ? "open" : "selected"})`,
            )
            .join(", ")}
        >
          {visible.map((collaborator, index) => (
            <CollaboratorAvatar
              key={collaborator.userId}
              collaborator={collaborator}
              className="ring-surface relative size-5 text-[10px] ring-2"
              style={{
                // Les premières par-dessus : ce sont celles qui ont le node
                // ouvert (cf. `byActivity`).
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
        {sorted.map((collaborator) => (
          <span
            key={collaborator.userId}
            className="flex items-center gap-1.5"
          >
            {collaborator.activity === "open" ? (
              <TbAppWindowFilled size={12} className="shrink-0" />
            ) : (
              <TbPointerFilled size={12} className="shrink-0" />
            )}
            <span className="font-medium">
              {collaboratorLabel(collaborator)}
            </span>
            <span className="opacity-70">
              {collaborator.activity === "open"
                ? "has it open"
                : "selected it"}
            </span>
          </span>
        ))}
      </TooltipContent>
    </Tooltip>
  );
}

export default memo(NodeCollaboratorsPill);
