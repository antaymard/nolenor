import { memo } from "react";
import {
  useNodeCollaborators,
  type NodeCollaborator,
} from "@/stores/canvasPresenceStore";
import { CollaboratorStack } from "./CollaboratorStack";

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

  return (
    <CollaboratorStack
      collaborators={[...collaborators].sort(byActivity)}
      className="absolute right-2 bottom-2 z-20"
    />
  );
}

export default memo(NodeCollaboratorsPill);
