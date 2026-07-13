import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/shadcn/dropdown-menu";
import { useReactFlow, useStore, type Edge } from "@xyflow/react";
import { TbTagOff, TbTrash } from "react-icons/tb";
import type { EdgeCustomData } from "@/types/domain";
import type { Id } from "@/types";
import { useNodeDataStore } from "@/stores/nodeDataStore";
import {
  getNodeDataTitle,
  getNodeIcon,
} from "@/components/utils/nodeDataDisplayUtils";
import { NODE_TYPE_ICON_MAP } from "@/components/nodes/prebuilt-nodes/nodeIconMap";
import { useGoToNode } from "@/hooks/useGoToNode";

export default function EdgeContextMenu({
  closeMenu,
  xyEdge,
}: {
  closeMenu: () => void;
  xyEdge: Edge;
}) {
  const { deleteElements, updateEdge } = useReactFlow();
  const goToNode = useGoToNode();

  const edgeData = (xyEdge.data || {}) as EdgeCustomData;

  const handleGoToEndpoint = (id: string) => {
    goToNode(id);
    closeMenu();
  };

  const handleRemoveLabel = () => {
    const restData = { ...edgeData };
    delete restData.label;
    updateEdge(xyEdge.id, {
      ...xyEdge,
      data: restData,
    });
    closeMenu();
  };

  return (
    <div className="w-52">
      <DropdownMenuLabel className="whitespace-nowrap">
        Edge actions
      </DropdownMenuLabel>
      <DropdownMenuSeparator />

      {/* Supprimer le label */}
      {edgeData.label && (
        <>
          <DropdownMenuItem
            className="whitespace-nowrap"
            onClick={handleRemoveLabel}
          >
            <TbTagOff size={16} /> Remove label
          </DropdownMenuItem>
          <DropdownMenuSeparator />
        </>
      )}

      {/* Source / Target */}
      <EdgeEndpointMenuItem
        nodeId={xyEdge.source}
        label="Source"
        onGo={handleGoToEndpoint}
      />
      <EdgeEndpointMenuItem
        nodeId={xyEdge.target}
        label="Target"
        onGo={handleGoToEndpoint}
      />
      <DropdownMenuSeparator />

      {/* Supprimer */}
      <DropdownMenuItem
        className="whitespace-nowrap "
        onClick={() => {
          deleteElements({ edges: [xyEdge] });
          closeMenu();
        }}
      >
        <TbTrash className="text-red-500" /> Delete
      </DropdownMenuItem>
    </div>
  );
}

function EdgeEndpointMenuItem({
  nodeId,
  label,
  onGo,
}: {
  nodeId: string;
  label: string;
  onGo: (id: string) => void;
}) {
  const nodes = useStore((state) => state.nodes);
  const nodeDatas = useNodeDataStore((state) => state.nodeDatas);

  const xyNode = nodes.find((n) => n.id === nodeId);
  const nodeDataId = xyNode?.data?.nodeDataId as string | undefined;
  const nodeData = nodeDataId
    ? nodeDatas.get(nodeDataId as Id<"nodeDatas">)
    : undefined;

  const title = nodeData ? getNodeDataTitle(nodeData) : "Node";
  const Icon = getNodeIcon(nodeData?.type) ?? NODE_TYPE_ICON_MAP.title;

  return (
    <>
      <DropdownMenuLabel className="px-2 py-1 text-xs font-normal text-muted-foreground">
        {label}
      </DropdownMenuLabel>
      <DropdownMenuItem
        className="whitespace-nowrap"
        onClick={() => onGo(nodeId)}
      >
        <Icon size={16} />{" "}
        <p title={title} className="truncate">
          {title}
        </p>
      </DropdownMenuItem>
    </>
  );
}
