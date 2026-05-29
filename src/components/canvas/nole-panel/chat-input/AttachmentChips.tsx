import { TbPlus, TbX } from "react-icons/tb";
import { HiMiniXMark } from "react-icons/hi2";
import { LuMousePointerClick } from "react-icons/lu";
import prebuiltNodesConfig from "@/components/nodes/prebuilt-nodes/prebuiltNodesConfig";
import { useNodeDataStore } from "@/stores/nodeDataStore";
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
    <div className="p-2 pb-0 flex flex-wrap gap-1">
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
    <div className="group relative flex items-center gap-1 rounded-sm border border-slate-300 bg-white px-2 py-1 text-sm text-slate-700 max-w-55">
      <button
        type="button"
        onClick={onRemove}
        aria-label="Retirer la position jointe"
        className="text-slate-500 hover:text-red-500"
      >
        <HiMiniXMark size={14} />
      </button>
      <LuMousePointerClick size={12} className="min-w-3" />
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
  const NodeIcon = prebuiltNodesConfig.find(
    (config) => config.type === node.type,
  )?.nodeIcon;
  const nodeTitle = getCanvasNodeTitle(node, nodeDatas);

  return (
    <div
      className={cn(
        "group relative flex items-center gap-1 rounded-sm border px-2 py-1 text-sm text-slate-700 max-w-55",
        isAttached ? "border-slate-300 bg-white" : "italic opacity-70",
      )}
    >
      <button
        type="button"
        className={cn(
          "text-slate-500",
          isAttached ? "hover:text-red-500" : "hover:text-green-500",
        )}
        onClick={() => (isAttached ? onRemove(node.id) : onAttach(node))}
        aria-label={isAttached ? "Retirer la piece jointe" : "Attacher le node"}
      >
        {isAttached ? <TbX size={14} /> : <TbPlus size={14} />}
      </button>
      {NodeIcon ? <NodeIcon size={12} className="min-w-3" /> : null}
      <span className="truncate">{nodeTitle}</span>
    </div>
  );
}
