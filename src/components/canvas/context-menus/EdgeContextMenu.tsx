import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/shadcn/dropdown-menu";
import { useReactFlow, useStore, type Edge } from "@xyflow/react";
import {
  TbCheck,
  TbLineHeight,
  TbPalette,
  TbPointFilled,
  TbTagOff,
  TbTrash,
  TbWaveSine,
} from "react-icons/tb";
import type {
  EdgeCustomData,
  EdgeStrokeStyle,
  EdgeStrokeWidth,
  colorsEnum,
} from "@/types/domain";
import type { Id } from "@/types";
import { useNodeDataStore } from "@/stores/nodeDataStore";
import {
  getNodeDataTitle,
  getNodeIcon,
} from "@/components/utils/nodeDataDisplayUtils";
import { NODE_TYPE_ICON_MAP } from "@/components/nodes/prebuilt-nodes/nodeIconMap";
import { useGoToNode } from "@/hooks/useGoToNode";
import { useUpdateCanvasEdge } from "@/hooks/useUpdateCanvasEdge";
import { colors } from "@/components/ui/styles";
import { cn } from "@/lib/utils";
import { MAX_BEND_POINTS } from "@/components/edges/edgeStyleUtils";
import { generateLlmId } from "@/../convex/lib/llmId";

const STROKE_WIDTH_OPTIONS: { key: EdgeStrokeWidth; label: string }[] = [
  { key: "thin", label: "Thin" },
  { key: "thick", label: "Thick" },
];

const STROKE_STYLE_OPTIONS: { key: EdgeStrokeStyle; label: string }[] = [
  { key: "solid", label: "Solid" },
  { key: "dashed", label: "Dashed" },
  { key: "dotted", label: "Dotted" },
];

export default function EdgeContextMenu({
  closeMenu,
  xyEdge,
  position,
}: {
  closeMenu: () => void;
  xyEdge: Edge;
  position: { x: number; y: number };
}) {
  const { deleteElements, screenToFlowPosition } = useReactFlow();
  const { updateCanvasEdge } = useUpdateCanvasEdge();
  const goToNode = useGoToNode();

  const edgeData = (xyEdge.data ?? {}) as EdgeCustomData;
  const availableColors = Object.entries(colors);
  const currentColor = (edgeData.color as colorsEnum) ?? "default";
  const currentStrokeWidth = edgeData.strokeWidth ?? "thin";
  const currentStrokeStyle = edgeData.strokeStyle ?? "solid";
  const bendPointCount = edgeData.bendPoints?.length ?? 0;

  const updateData = (data: Record<string, unknown>) => {
    updateCanvasEdge({ edgeId: xyEdge.id, data });
  };

  const handleGoToEndpoint = (id: string) => {
    goToNode(id);
    closeMenu();
  };

  const handleRemoveLabel = () => {
    updateData({ label: null });
    closeMenu();
  };

  const handleAddBendPoint = () => {
    if (bendPointCount >= MAX_BEND_POINTS) return;
    const flowPos = screenToFlowPosition({ x: position.x, y: position.y });
    const newBendPoint = {
      id: generateLlmId(),
      x: flowPos.x,
      y: flowPos.y,
    };
    updateData({
      bendPoints: [...(edgeData.bendPoints ?? []), newBendPoint],
    });
    closeMenu();
  };

  return (
    <div className="w-56">
      <DropdownMenuLabel className="whitespace-nowrap">
        Edge actions
      </DropdownMenuLabel>
      <DropdownMenuSeparator />

      {/* Color */}
      <DropdownMenuSub>
        <DropdownMenuSubTrigger className="whitespace-nowrap">
          <TbPalette size={16} /> Color
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          <div className="grid grid-cols-5 gap-2 p-2">
            {availableColors.map(([key, value]) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  updateData({ color: key as colorsEnum });
                  closeMenu();
                }}
                className={cn(
                  "relative w-10 h-10 rounded-full border-2 transition-all hover:scale-110",
                  value.nodeBg,
                  currentColor === key
                    ? "border-primary shadow-md"
                    : "border-border hover:border-primary/50",
                )}
                title={value.label}
              >
                {currentColor === key && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <TbCheck
                      className="w-5 h-5 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]"
                      strokeWidth={3}
                    />
                  </div>
                )}
              </button>
            ))}
          </div>
        </DropdownMenuSubContent>
      </DropdownMenuSub>

      {/* Thickness */}
      <DropdownMenuSub>
        <DropdownMenuSubTrigger className="whitespace-nowrap">
          <TbLineHeight size={16} /> Thickness
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          {STROKE_WIDTH_OPTIONS.map((opt) => (
            <DropdownMenuItem
              key={opt.key}
              className="whitespace-nowrap"
              onClick={() => {
                updateData({ strokeWidth: opt.key });
                closeMenu();
              }}
            >
              <span className="flex items-center gap-2">
                {currentStrokeWidth === opt.key && <TbCheck size={16} />}
                {opt.label}
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuSubContent>
      </DropdownMenuSub>

      {/* Appearance (stroke style) */}
      <DropdownMenuSub>
        <DropdownMenuSubTrigger className="whitespace-nowrap">
          <TbWaveSine size={16} /> Appearance
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          {STROKE_STYLE_OPTIONS.map((opt) => (
            <DropdownMenuItem
              key={opt.key}
              className="whitespace-nowrap"
              onClick={() => {
                updateData({ strokeStyle: opt.key });
                closeMenu();
              }}
            >
              <span className="flex items-center gap-2">
                {currentStrokeStyle === opt.key && <TbCheck size={16} />}
                {opt.label}
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuSubContent>
      </DropdownMenuSub>

      <DropdownMenuSeparator />

      {/* Add bend point */}
      {bendPointCount < MAX_BEND_POINTS && (
        <DropdownMenuItem
          className="whitespace-nowrap"
          onClick={handleAddBendPoint}
        >
          <TbPointFilled size={16} /> Add point
          <span className="ml-auto text-xs text-muted-foreground">
            {bendPointCount}/{MAX_BEND_POINTS}
          </span>
        </DropdownMenuItem>
      )}

      {/* Remove label */}
      {edgeData.label && (
        <DropdownMenuItem
          className="whitespace-nowrap"
          onClick={handleRemoveLabel}
        >
          <TbTagOff size={16} /> Remove label
        </DropdownMenuItem>
      )}

      <DropdownMenuSeparator />

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

      {/* Delete */}
      <DropdownMenuItem
        className="whitespace-nowrap"
        onClick={() => {
          deleteElements({ edges: [xyEdge] });
          closeMenu();
        }}
      >
        <TbTrash className="text-red-500" size={16} /> Delete
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
