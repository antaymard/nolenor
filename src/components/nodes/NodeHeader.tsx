import { memo } from "react";
import type { IconType } from "react-icons";
import type { Id } from "@/../convex/_generated/dataModel";
import { useNodeDataTitle } from "@/hooks/useNodeTitle";
import { NODE_TYPE_ICON_MAP } from "./prebuilt-nodes/nodeIconMap";

/**
 * Hauteur de l'en-tête, en px. Doit rester alignée sur le `h-8` ci-dessous :
 * les nodes qui dimensionnent leur contenu en JS (la mosaïque d'ImageNode) la
 * retranchent de la hauteur du node.
 */
export const NODE_HEADER_HEIGHT = 32;

interface NodeHeaderProps {
  icon: IconType;
  title: string;
  /** Boutons alignés à droite du titre (ex. Refresh d'une app). */
  actions?: React.ReactNode;
}

/**
 * La ligne titre en haut d'un node : icône, titre tronqué, actions. Purement
 * présentationnelle — partagée par les en-têtes propres à un type (AppNode,
 * LinkNode embed) et par celui que `NodeFrame` pose pour l'option d'affichage
 * `showTitle`.
 */
export function NodeHeader({ icon: Icon, title, actions }: NodeHeaderProps) {
  return (
    <div className="flex items-center gap-2 h-8 shrink-0 px-2 py-1.5 font-medium rounded-t-[4px]">
      <Icon size={18} className="shrink-0" />
      <p className="truncate flex-1 min-w-0" title={title}>
        {title}
      </p>
      {actions}
    </div>
  );
}

/**
 * L'en-tête de l'option `showTitle`. Composant à part pour que la
 * souscription au titre ne vive que dans les nodes qui l'affichent :
 * `NodeFrame`, lui, ne s'abonne à rien.
 */
function NodeTitleHeaderComponent({
  nodeDataId,
  nodeType,
  actions,
}: {
  nodeDataId: Id<"nodeDatas"> | undefined;
  nodeType: string | undefined;
  actions?: React.ReactNode;
}) {
  const title = useNodeDataTitle(nodeDataId) ?? "";
  const icon =
    (nodeType && NODE_TYPE_ICON_MAP[nodeType]) || NODE_TYPE_ICON_MAP.custom;
  return <NodeHeader icon={icon} title={title} actions={actions} />;
}

export const NodeTitleHeader = memo(NodeTitleHeaderComponent);
