import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/shadcn/dropdown-menu";
import { useReactFlow, useStore, type Edge } from "@xyflow/react";
import { TbTagOff, TbTrash } from "react-icons/tb";
import nodeColors from "@/components/nodes/nodeColors";
import type {
  EdgeCustomData,
  EdgeStrokeWidth,
  EdgeMarker,
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

export default function EdgeContextMenu({
  closeMenu,
  position,
  xyEdge,
}: {
  closeMenu: () => void;
  position: { x: number; y: number };
  xyEdge: Edge;
}) {
  const { deleteElements, updateEdge } = useReactFlow();
  const goToNode = useGoToNode();

  const edgeData = (xyEdge.data || {}) as EdgeCustomData;

  const handleGoToEndpoint = (id: string) => {
    goToNode(id);
    closeMenu();
  };

  const updateEdgeData = (newData: Partial<EdgeCustomData>) => {
    updateEdge(xyEdge.id, {
      ...xyEdge,
      data: { ...edgeData, ...newData },
    });
  };

  const handleRemoveLabel = () => {
    const { label, ...restData } = edgeData;
    updateEdge(xyEdge.id, {
      ...xyEdge,
      data: restData,
    });
    closeMenu();
  };

  const handleColorChange = (color: colorsEnum) => {
    updateEdgeData({ color });
  };

  const handleStrokeWidthChange = (strokeWidth: EdgeStrokeWidth) => {
    updateEdgeData({ strokeWidth });
  };

  const handleMarkerStartChange = (markerStart: EdgeMarker) => {
    updateEdgeData({ markerStart });
  };

  const handleMarkerEndChange = (markerEnd: EdgeMarker) => {
    updateEdgeData({ markerEnd });
  };

  const strokeWidthLabels = {
    thin: "Thin",
    regular: "Regular",
    thick: "Thick",
  };

  const markerLabels = {
    none: "None",
    arrow: "Arrow",
  };

  // Filtrer les couleurs disponibles (sans transparent)
  const availableColors = Object.entries(nodeColors).filter(
    ([key]) => key !== "transparent",
  );

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

      {/* Couleur */}
      {/* <DropdownMenuSub>
        <DropdownMenuSubTrigger className="whitespace-nowrap">
          <TbPalette size={16} /> Couleur
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          <DropdownMenuRadioGroup
            value={edgeData.color || "default"}
            onValueChange={(value) => handleColorChange(value as colorsEnum)}
          >
            {availableColors.map(([key, value]) => (
              <DropdownMenuRadioItem
                value={key}
                key={key}
                onClick={() => handleColorChange(key as colorsEnum)}
              >
                <div
                  className={`border ${value.border} ${value.bg} rounded-sm p-1 ${value.text}`}
                >
                  {value.label}
                </div>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuSubContent>
      </DropdownMenuSub> */}

      {/* Épaisseur */}
      {/* <DropdownMenuSub>
        <DropdownMenuSubTrigger className="whitespace-nowrap">
          <TbLineHeight size={16} /> Épaisseur
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          <DropdownMenuRadioGroup
            value={edgeData.strokeWidth || "regular"}
            onValueChange={(value) =>
              handleStrokeWidthChange(value as EdgeStrokeWidth)
            }
          >
            {Object.entries(strokeWidthLabels).map(([key, label]) => (
              <DropdownMenuRadioItem
                value={key}
                key={key}
                onClick={() => handleStrokeWidthChange(key as EdgeStrokeWidth)}
              >
                {label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuSubContent>
      </DropdownMenuSub> */}

      {/* Marker Début */}
      {/* <DropdownMenuSub>
        <DropdownMenuSubTrigger className="whitespace-nowrap">
          <TbCircle size={16} /> Début
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          <DropdownMenuRadioGroup
            value={edgeData.markerStart || "none"}
            onValueChange={(value) =>
              handleMarkerStartChange(value as EdgeMarker)
            }
          >
            {Object.entries(markerLabels).map(([key, label]) => (
              <DropdownMenuRadioItem
                value={key}
                key={key}
                onClick={() => handleMarkerStartChange(key as EdgeMarker)}
              >
                {label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuSubContent>
      </DropdownMenuSub> */}

      {/* Marker Fin */}
      {/* <DropdownMenuSub>
        <DropdownMenuSubTrigger className="whitespace-nowrap">
          <TbArrowRight size={16} /> Fin
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          <DropdownMenuRadioGroup
            value={edgeData.markerEnd || "none"}
            onValueChange={(value) => handleMarkerEndChange(value as EdgeMarker)}
          >
            {Object.entries(markerLabels).map(([key, label]) => (
              <DropdownMenuRadioItem
                value={key}
                key={key}
                onClick={() => handleMarkerEndChange(key as EdgeMarker)}
              >
                {label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuSubContent>
      </DropdownMenuSub>

      <DropdownMenuSeparator /> */}

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
        <TbTrash className="text-destructive" /> Delete
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
