import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
  useReactFlow,
} from "@xyflow/react";
import { memo, useState, useRef, useEffect } from "react";
import nodeColors from "../nodes/nodeColors";
import type { EdgeCustomData } from "@/types/domain";

const strokeWidthMap = {
  thin: 1,
  regular: 2,
  thick: 4,
};

const CustomEdge = memo(function CustomEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  markerStart,
  data,
}: EdgeProps) {
  const customData = data as EdgeCustomData | undefined;
  const { setEdges } = useReactFlow();
  const [isEditing, setIsEditing] = useState(false);
  const [labelValue, setLabelValue] = useState(customData?.label || "");
  const inputRef = useRef<HTMLInputElement>(null);

  // Check if edit mode was triggered externally
  useEffect(() => {
    if ((customData as any)?._editMode) {
      setIsEditing(true);
      setLabelValue(customData?.label || "");
      // Clear the edit mode flag
      setEdges((edges) =>
        edges.map((edge) => {
          if (edge.id === id) {
            const { _editMode, ...restData } = edge.data || {};
            return { ...edge, data: restData };
          }
          return edge;
        })
      );
    }
  }, [(customData as any)?._editMode]);

  // Get edge customization from data
  const color = customData?.color || "default";
  const strokeWidth = strokeWidthMap[customData?.strokeWidth || "regular"];
  const label = customData?.label;
  const customMarkerStart = customData?.markerStart || "none";
  const customMarkerEnd = customData?.markerEnd || "none";

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleLabelClick = () => {
    setIsEditing(true);
    setLabelValue(label || "");
  };

  const handleLabelChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLabelValue(e.target.value);
  };

  const saveLabel = () => {
    setIsEditing(false);
    setEdges((edges) =>
      edges.map((edge) =>
        edge.id === id
          ? { ...edge, data: { ...edge.data, label: labelValue } }
          : edge
      )
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      saveLabel();
    } else if (e.key === "Escape") {
      setIsEditing(false);
      setLabelValue(label || "");
    }
  };

  const handleBlur = () => {
    saveLabel();
  };

  // Get color from nodeColors
  const colorConfig = nodeColors[color];
  const strokeColor = colorConfig?.plain.replace("bg-", "");

  // Convert a Tailwind bg-[var(--x)] fragment to a plain CSS color value
  const getCSSColor = (tailwindClass: string): string => {
    if (tailwindClass.startsWith("[") && tailwindClass.endsWith("]")) {
      return tailwindClass.slice(1, -1);
    }
    return "var(--muted-foreground)";
  };

  const edgeColor = getCSSColor(strokeColor);

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  // Create unique marker IDs
  const markerStartId =
    customMarkerStart === "arrow" ? `marker-start-${id}` : undefined;
  const markerEndId =
    customMarkerEnd === "arrow" ? `marker-end-${id}` : undefined;

  return (
    <>
      <defs>
        {customMarkerStart === "arrow" && (
          <marker
            id={markerStartId}
            viewBox="0 0 10 10"
            refX="5"
            refY="5"
            markerWidth={6}
            markerHeight={6}
            orient="auto-start-reverse"
          >
            <path
              d="M 10 5 L 0 0 L 0 10 z"
              fill={edgeColor}
              strokeWidth={0}
            />
          </marker>
        )}
        {customMarkerEnd === "arrow" && (
          <marker
            id={markerEndId}
            viewBox="0 0 10 10"
            refX="5"
            refY="5"
            markerWidth={6}
            markerHeight={6}
            orient="auto"
          >
            <path
              d="M 0 0 L 10 5 L 0 10 z"
              fill={edgeColor}
              strokeWidth={0}
            />
          </marker>
        )}
      </defs>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          ...style,
          stroke: edgeColor,
          strokeWidth,
        }}
        markerStart={markerStartId ? `url(#${markerStartId})` : undefined}
        markerEnd={markerEndId ? `url(#${markerEndId})` : undefined}
      />
      {(label || isEditing) && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: "all",
            }}
            className="nodrag nopan"
            onDoubleClick={(e) => {
              e.stopPropagation();
              handleLabelClick();
            }}
          >
            {isEditing ? (
              <input
                ref={inputRef}
                type="text"
                value={labelValue}
                onChange={handleLabelChange}
                onKeyDown={handleKeyDown}
                onBlur={handleBlur}
                className="px-2 py-1 bg-card border-2 border-(--brand) rounded text-xs shadow-sm outline-none min-w-[80px]"
              />
            ) : (
              <div className="px-2 py-1 bg-card border rounded text-xs shadow-sm cursor-pointer hover:border-(--brand)/70 transition-colors">
                {label}
              </div>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});

export default CustomEdge;
