import type { ReactNode } from "react";
import { TbPlus, TbX } from "react-icons/tb";
import { HiMiniXMark } from "react-icons/hi2";
import { LuMousePointerClick } from "react-icons/lu";
import { getNodeDataTitle } from "@/../convex/lib/getNodeDataTitle";
import prebuiltNodesConfig from "@/components/nodes/prebuilt-nodes/prebuiltNodesConfig";
import { useNodeData } from "@/hooks/useNodeData";
import { getNodeDataId, useNodeDataIdOf } from "@/lib/nodeIdentity";
import { useTemplatesStore } from "@/stores/templatesStore";
import { cn } from "@/lib/utils";
import type { CanvasNode } from "@/types";
import { Kbd } from "@/components/shadcn/kbd";

type AttachmentActions = {
  addAttachments: (args: { nodes: CanvasNode[] }) => void;
  removeAttachments: (
    items: Array<{ type: "position" } | { type: "node"; ids: string[] }>,
  ) => void;
};

type AttachmentRowProps = AttachmentActions & {
  selectableNodes: readonly CanvasNode[];
  attachedNodes: readonly CanvasNode[];
  attachedPosition?: { x: number; y: number } | null;
  /**
   * Ligne affichée quand rien n'est attaché. Par défaut, le raccourci Alt +
   * clic — qui n'existe pas au doigt : le composer mobile passe le sien.
   */
  emptyHint?: ReactNode;
};

/**
 * Row of attachment chips shown above the chat composer: the optional attached
 * canvas position, the currently-selected (not-yet-attached) nodes, and the
 * already-attached nodes. Shared by the desktop and mobile composers.
 */
export function AttachmentRow({
  selectableNodes,
  attachedNodes,
  attachedPosition,
  addAttachments,
  removeAttachments,
  emptyHint,
}: AttachmentRowProps) {
  const hasAny =
    selectableNodes.length > 0 ||
    attachedNodes.length > 0 ||
    !!attachedPosition;
  if (!hasAny)
    return (
      <div className="flex items-center justify-start gap-1 px-2 pt-2 text-xs opacity-50 italic">
        {emptyHint ?? (
          <>
            <Kbd>Alt + Clic</Kbd> on a node to attach as context
          </>
        )}
      </div>
    );

  const removeNode = (nodeId: string) =>
    removeAttachments([{ type: "node", ids: [nodeId] }]);
  const attachNode = (node: CanvasNode) => addAttachments({ nodes: [node] });

  return (
    <div className="flex flex-wrap gap-1 px-2 pt-2">
      {attachedPosition ? (
        <PositionAttachment
          position={attachedPosition}
          onRemove={() => removeAttachments([{ type: "position" }])}
        />
      ) : null}
      {selectableNodes.map((node) => (
        <NodeAttachment
          key={node.id}
          node={node}
          isAttached={false}
          onRemove={removeNode}
          onAttach={attachNode}
        />
      ))}
      {attachedNodes.map((node) => (
        <NodeAttachment
          key={node.id}
          node={node}
          isAttached
          onRemove={removeNode}
          onAttach={attachNode}
        />
      ))}
    </div>
  );
}

function PositionAttachment({
  position,
  onRemove,
}: {
  position: { x: number; y: number };
  onRemove: () => void;
}) {
  return (
    <div className="group relative flex max-w-55 items-center gap-1 rounded-full border border-violet-200 bg-violet-50 py-0.5 pr-2.5 pl-1.5 text-sm font-medium text-violet-700">
      <button
        type="button"
        onClick={onRemove}
        aria-label="Retirer la position jointe"
        className="rounded-full text-violet-400 transition-colors hover:text-red-500"
      >
        <HiMiniXMark size={14} />
      </button>
      <LuMousePointerClick size={12} className="min-w-3 text-violet-400" />
      <span className="truncate">
        Position ({Math.round(position.x)}, {Math.round(position.y)})
      </span>
    </div>
  );
}

function NodeAttachment({
  node,
  isAttached,
  onRemove,
  onAttach,
}: {
  node: CanvasNode;
  isAttached: boolean;
  onRemove: (nodeId: string) => void;
  onAttach: (node: CanvasNode) => void;
}) {
  // Le `node` reçu est un snapshot (pris à la sélection / à l'attachement) :
  // son contenu ne suit pas les renommages. On résout le titre depuis les
  // sources vivantes — nodeDataId suivi via React Flow (gère aussi la
  // bascule pending_ → id serveur), puis le doc suivi par id — pour que le
  // chip se mette à jour sans ré-attacher.
  const liveDataId = useNodeDataIdOf(node.id);
  const dataId = liveDataId ?? getNodeDataId(node);
  const nodeData = useNodeData(dataId);
  // Souscription : la Map ne change de référence que quand un template change
  // réellement (upsertTemplates renvoie l'état inchangé sinon), donc renommer
  // un template met le chip à jour sans re-rendre à chaque push de query.
  const templates = useTemplatesStore((state) => state.templates);
  const NodeIcon = prebuiltNodesConfig.find(
    (config) => config.type === node.type,
  )?.nodeIcon;
  const template = nodeData?.templateId
    ? templates.get(nodeData.templateId)
    : undefined;
  const nodeTitle = nodeData
    ? getNodeDataTitle(nodeData, template ?? null)
    : (prebuiltNodesConfig.find((config) => config.type === node.type)?.label ||
      node.type);

  return (
    <div
      className={cn(
        "group relative flex max-w-55 items-center gap-1 rounded-full border py-0.5 pr-2.5 pl-1.5 text-sm transition-colors",
        isAttached
          ? // Joint : violet Nolë (même sens que l'anneau pointillé du node
            // attaché sur le canvas), plein et opaque — impossible à
            // confondre avec la version pointillée grise ci-dessous.
            "border-violet-300 bg-violet-50 font-medium text-violet-800"
          : "border-dashed border-slate-200 text-slate-600 italic opacity-70 hover:opacity-100",
      )}
    >
      <button
        type="button"
        className={cn(
          "rounded-full transition-colors",
          isAttached
            ? "text-violet-400 hover:text-red-500"
            : "text-slate-400 hover:text-emerald-600",
        )}
        onClick={() => (isAttached ? onRemove(node.id) : onAttach(node))}
        aria-label={isAttached ? "Retirer la piece jointe" : "Attacher le node"}
      >
        {isAttached ? <TbX size={14} /> : <TbPlus size={14} />}
      </button>
      {NodeIcon ? (
        <NodeIcon
          size={12}
          className={cn(
            "min-w-3",
            isAttached ? "text-violet-500" : "text-slate-400",
          )}
        />
      ) : null}
      <span className="truncate">{nodeTitle}</span>
    </div>
  );
}
