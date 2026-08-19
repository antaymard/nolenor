import { TbPlus, TbX } from "react-icons/tb";
import { HiMiniXMark } from "react-icons/hi2";
import { LuMousePointerClick } from "react-icons/lu";
import prebuiltNodesConfig from "@/components/nodes/prebuilt-nodes/prebuiltNodesConfig";
import { useNodeDataStore } from "@/stores/nodeDataStore";
import { useTemplatesStore } from "@/stores/templatesStore";
import { getCanvasNodeTitle } from "@/lib/getCanvasNodeTitle";
import { cn } from "@/lib/utils";
import type { CanvasNode } from "@/types";

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
}: AttachmentRowProps) {
  const hasAny =
    selectableNodes.length > 0 || attachedNodes.length > 0 || !!attachedPosition;
  if (!hasAny) return null;

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
    <div className="group relative flex max-w-55 items-center gap-1 rounded-full border border-slate-200 bg-slate-50 py-0.5 pr-2.5 pl-1.5 text-sm text-slate-600">
      <button
        type="button"
        onClick={onRemove}
        aria-label="Retirer la position jointe"
        className="rounded-full text-slate-400 transition-colors hover:text-red-500"
      >
        <HiMiniXMark size={14} />
      </button>
      <LuMousePointerClick size={12} className="min-w-3 text-slate-400" />
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
  const nodeDatas = useNodeDataStore((state) => state.nodeDatas);
  // Souscription : la Map ne change de référence que quand un template change
  // réellement (upsertTemplates renvoie l'état inchangé sinon), donc renommer
  // un template met le chip à jour sans re-rendre à chaque push de query.
  const templates = useTemplatesStore((state) => state.templates);
  const NodeIcon = prebuiltNodesConfig.find(
    (config) => config.type === node.type,
  )?.nodeIcon;
  const nodeTitle = getCanvasNodeTitle(node, nodeDatas, templates);

  return (
    <div
      className={cn(
        "group relative flex max-w-55 items-center gap-1 rounded-full border py-0.5 pr-2.5 pl-1.5 text-sm text-slate-600 transition-colors",
        isAttached
          ? "border-slate-200 bg-slate-50"
          : "border-dashed border-slate-200 italic opacity-70 hover:opacity-100",
      )}
    >
      <button
        type="button"
        className={cn(
          "rounded-full text-slate-400 transition-colors",
          isAttached ? "hover:text-red-500" : "hover:text-emerald-600",
        )}
        onClick={() => (isAttached ? onRemove(node.id) : onAttach(node))}
        aria-label={isAttached ? "Retirer la piece jointe" : "Attacher le node"}
      >
        {isAttached ? <TbX size={14} /> : <TbPlus size={14} />}
      </button>
      {NodeIcon ? (
        <NodeIcon size={12} className="min-w-3 text-slate-400" />
      ) : null}
      <span className="truncate">{nodeTitle}</span>
    </div>
  );
}
