import { useState } from "react";
import { useStore } from "@xyflow/react";
import { TbNetwork, TbTrash } from "react-icons/tb";
import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/shadcn/popover";
import { cn } from "@/lib/utils";
import {
  getNodeDataTitle,
  getNodeIcon,
} from "@/components/utils/nodeDataDisplayUtils";
import { useNodeDataStore } from "@/stores/nodeDataStore";
import { useWindowsStore } from "@/stores/windowsStore";
import { openableNodeTypes } from "@/components/nodes/prebuilt-nodes/prebuiltNodesConfig";
import type { Id } from "@/../convex/_generated/dataModel";
import type { NodeType } from "@/types/domain/nodeTypes";
import type { CellValue, NodeCellValue } from "./types";
import { getNodeDataId } from "@/lib/nodeIdentity";

export interface NodeCellEditorProps {
  value: NodeCellValue | null | undefined;
  isEditing: boolean;
  readOnly?: boolean;
  onClick: () => void;
  onChange: (val: CellValue) => void;
  onBlur: () => void;
}

function isOpenableNodeType(type: string): type is NodeType {
  return openableNodeTypes.has(type as NodeType);
}

export function NodeCellEditor({
  value,
  isEditing,
  readOnly,
  onClick,
  onChange,
  onBlur,
}: NodeCellEditorProps) {
  const [search, setSearch] = useState("");
  const nodes = useStore((state) => state.nodes);
  const nodeDatas = useNodeDataStore((state) => state.nodeDatas);
  const openWindow = useWindowsStore((state) => state.openWindow);

  const selectedNode = value?.nodeId
    ? nodes.find((n) => n.id === value.nodeId)
    : undefined;
  const selectedNodeDataId = selectedNode?.data?.nodeDataId as
    | Id<"nodeDatas">
    | undefined;
  const selectedNodeData = selectedNodeDataId
    ? nodeDatas.get(selectedNodeDataId)
    : undefined;
  const selectedTitle = selectedNodeData
    ? getNodeDataTitle(selectedNodeData)
    : value?.nodeId
      ? "Node supprimé"
      : null;
  const SelectedIcon = selectedNodeData
    ? getNodeIcon(selectedNodeData.type)
    : TbNetwork;

  const filteredNodes = nodes
    .filter((n) => {
      const nodeDataId = getNodeDataId(n);
      if (!nodeDataId) return false;
      const nodeData = nodeDatas.get(nodeDataId);
      if (!nodeData) return false;
      if (!search.trim()) return true;
      return getNodeDataTitle(nodeData)
        .toLowerCase()
        .includes(search.trim().toLowerCase());
    })
    .map((n) => {
      const nodeDataId = n.data?.nodeDataId as Id<"nodeDatas">;
      const nodeData = nodeDatas.get(nodeDataId)!;
      return {
        nodeId: n.id,
        nodeDataId,
        nodeData,
        title: getNodeDataTitle(nodeData),
      };
    });

  const handleSelect = (nodeId: string) => {
    onChange({ nodeId });
    setSearch("");
    onBlur();
  };

  const handleOpenNode = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!selectedNode || !selectedNodeData || !selectedNodeDataId) return;
    if (!isOpenableNodeType(selectedNodeData.type)) return;
    openWindow({
      xyNodeId: selectedNode.id,
      nodeDataId: selectedNodeDataId,
      nodeType: selectedNodeData.type,
    });
  };

  if (readOnly) {
    if (!selectedTitle) {
      return <span className="block w-full min-h-[1.4em] px-1" />;
    }
    return (
      <span className="flex items-center gap-1 w-full min-h-[1.4em] px-1">
        <NodeChip
          title={selectedTitle}
          Icon={SelectedIcon}
          faded={!selectedNodeData}
        />
      </span>
    );
  }

  return (
    <Popover
      open={isEditing}
      onOpenChange={(open) => {
        if (!open) {
          setSearch("");
          onBlur();
        }
      }}
    >
      <PopoverTrigger asChild>
        <span
          className={cn(
            "flex items-center gap-1 w-full min-h-[1.4em] rounded px-1 cursor-pointer hover:bg-muted/50",
          )}
          onClick={onClick}
        >
          {selectedTitle ? (
            <NodeChip
              title={selectedTitle}
              Icon={SelectedIcon}
              faded={!selectedNodeData}
              onClick={
                selectedNodeData && isOpenableNodeType(selectedNodeData.type)
                  ? handleOpenNode
                  : undefined
              }
            />
          ) : (
            <span className="text-muted-foreground">Ajouter un node…</span>
          )}
        </span>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start">
        <div className="flex flex-col gap-1.5">
          <Input
            autoFocus
            placeholder="Rechercher…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onBlur();
            }}
            className="h-7"
          />
          <div className="max-h-48 overflow-y-auto flex flex-col gap-0.5">
            {filteredNodes.length === 0 && (
              <span className="text-muted-foreground px-2 py-1">
                Aucun node trouvé
              </span>
            )}
            {filteredNodes.map(({ nodeId, nodeData, title }) => {
              const Icon = getNodeIcon(nodeData.type) ?? TbNetwork;
              return (
                <button
                  key={nodeId}
                  className={cn(
                    "flex items-center gap-2 rounded px-2 py-1 text-left hover:bg-muted w-full",
                    value?.nodeId === nodeId && "bg-muted font-medium",
                  )}
                  onClick={() => handleSelect(nodeId)}
                >
                  <Icon size={14} className="shrink-0 text-muted-foreground" />
                  <span className="truncate">{title}</span>
                </button>
              );
            })}
          </div>
          {value?.nodeId && (
            <Button
              size="sm"
              variant="ghost"
              className="w-full text-muted-foreground hover:text-destructive h-7"
              onClick={() => {
                onChange(null);
                onBlur();
              }}
            >
              <TbTrash size={13} className="mr-1" />
              Supprimer la référence
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function NodeChip({
  title,
  Icon,
  faded,
  onClick,
}: {
  title: string;
  Icon:
    | React.ComponentType<{ size?: number; className?: string }>
    | null
    | undefined;
  faded?: boolean;
  onClick?: (e: React.MouseEvent) => void;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 font-medium max-w-full",
        faded && "opacity-50",
        onClick && "cursor-pointer hover:bg-muted/70",
      )}
      onClick={onClick}
    >
      {Icon ? (
        <Icon size={13} className="shrink-0 text-muted-foreground" />
      ) : (
        <TbNetwork size={13} className="shrink-0 text-muted-foreground" />
      )}
      <span className="truncate">{title}</span>
    </span>
  );
}
