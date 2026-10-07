import { memo } from "react";
import {
  collaboratorColor,
  collaboratorLabel,
  useNodeCollaborators,
} from "@/stores/canvasPresenceStore";
import { CollaboratorAvatar } from "./CollaboratorAvatar";

const MAX_AVATARS = 3;

/**
 * Qui d'autre est sur ce node — l'a sélectionné, ou l'a ouvert en window :
 * une pill dans son coin bas-droit, à la couleur du premier collaborateur.
 * Pas de liseré ni de ring — le ring reste le signal de SA propre sélection.
 *
 * Se rend dans le conteneur interne du node (positionné, `overflow-hidden`) :
 * elle est visuellement dans le node. `pointer-events-none` : sinon elle
 * avalerait le début d'un drag ou un double-clic qui part du coin.
 */
function NodeCollaboratorsPill({ nodeId }: { nodeId: string }) {
  const collaborators = useNodeCollaborators(nodeId);
  if (!collaborators || collaborators.length === 0) return null;

  const [first, ...others] = collaborators;
  const label =
    others.length === 0
      ? collaboratorLabel(first)
      : `${collaboratorLabel(first)} +${others.length}`;

  return (
    <div
      aria-label={`Selected by ${collaborators.map(collaboratorLabel).join(", ")}`}
      className="pointer-events-none absolute right-1.5 bottom-1.5 z-20 flex max-w-[calc(100%-12px)] items-center gap-1 rounded-full py-0.5 pr-2 pl-0.5 text-[11px] leading-4 font-medium text-white shadow-sm"
      style={{ backgroundColor: collaboratorColor(first.userId) }}
    >
      <div className="flex shrink-0 items-center -space-x-1">
        {collaborators.slice(0, MAX_AVATARS).map((collaborator) => (
          <CollaboratorAvatar
            key={collaborator.userId}
            collaborator={collaborator}
            className="size-4 text-[9px] ring-1 ring-white/70"
          />
        ))}
      </div>
      <span className="truncate">{label}</span>
    </div>
  );
}

export default memo(NodeCollaboratorsPill);
