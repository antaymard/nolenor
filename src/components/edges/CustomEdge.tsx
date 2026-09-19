import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  useReactFlow,
  type EdgeProps,
  type Position,
} from "@xyflow/react";
import { memo } from "react";
import { useEdgeEditorStore } from "@/stores/edgeEditorStore";
import { useUpdateCanvasEdge } from "@/hooks/useUpdateCanvasEdge";
import type { EdgeBendPoint, EdgeCustomData } from "@/types/domain";
import {
  DEFAULT_EDGE_STROKE_STYLE,
  DEFAULT_EDGE_STROKE_WIDTH,
  edgeDashArrayMap,
  edgeStrokeWidthMap,
  getEdgeHexColor,
} from "./edgeStyleUtils";
import EdgeLabelEditor from "./EdgeLabelEditor";
import EdgeBendHandle from "./EdgeBendHandle";

/**
 * Computes a smooth quadratic bezier path that passes exactly through every
 * bend point (in flow coordinates), from source to target.
 *
 * Uses one `Q` segment (control = midpoint of source and first bend point)
 * followed by `T` smooth-continuation segments for each subsequent point.
 * The curve has C1 continuity (smooth tangents) at every bend point.
 */
function getSmoothPathThroughPoints(
  sourceX: number,
  sourceY: number,
  bendPoints: EdgeBendPoint[],
  targetX: number,
  targetY: number,
): [string, number, number] {
  const points = [
    { x: sourceX, y: sourceY },
    ...bendPoints.map((bp) => ({ x: bp.x, y: bp.y })),
    { x: targetX, y: targetY },
  ];

  if (points.length < 3) {
    return [
      `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`,
      (sourceX + targetX) / 2,
      (sourceY + targetY) / 2,
    ];
  }

  let path = `M ${points[0].x} ${points[0].y}`;
  const c1x = (points[0].x + points[1].x) / 2;
  const c1y = (points[0].y + points[1].y) / 2;
  path += ` Q ${c1x} ${c1y} ${points[1].x} ${points[1].y}`;
  for (let i = 2; i < points.length; i++) {
    path += ` T ${points[i].x} ${points[i].y}`;
  }

  const midIndex = Math.floor(points.length / 2);
  const labelPoint = points[midIndex];
  return [path, labelPoint.x, labelPoint.y];
}

function CustomEdge({
  id,
  data,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerStart,
  markerEnd,
  selected,
}: EdgeProps) {
  const edgeData = (data ?? {}) as EdgeCustomData;
  const { setEdges, getEdge } = useReactFlow();
  const { updateCanvasEdge } = useUpdateCanvasEdge();
  const isEditing = useEdgeEditorStore((s) => s.editingEdgeId === id);
  const setEditingEdgeId = useEdgeEditorStore((s) => s.setEditingEdgeId);

  const strokeWidthKey =
    edgeData.strokeWidth ?? DEFAULT_EDGE_STROKE_WIDTH;
  const strokeStyleKey =
    edgeData.strokeStyle ?? DEFAULT_EDGE_STROKE_STYLE;
  const hex = getEdgeHexColor(edgeData.color);
  // Texte du label plus contrasté que le trait quand l'edge est grise
  // (default / transparent / sans couleur) : #94a3b8 sur blanc est trop pâle.
  const isGrayEdge =
    !edgeData.color ||
    edgeData.color === "default" ||
    edgeData.color === "transparent";
  const labelColor = isGrayEdge ? "#475569" : hex;
  const { svgWidth, labelFontSize } =
    edgeStrokeWidthMap[strokeWidthKey] ?? edgeStrokeWidthMap.thin;
  const dashArray = edgeDashArrayMap[strokeStyleKey];

  const bendPoints = edgeData.bendPoints ?? [];
  const hasBendPoints = bendPoints.length > 0;

  const [edgePath, labelX, labelY] = hasBendPoints
    ? getSmoothPathThroughPoints(
        sourceX,
        sourceY,
        bendPoints,
        targetX,
        targetY,
      )
    : getBezierPath({
        sourceX,
        sourceY,
        sourcePosition: sourcePosition as Position,
        targetX,
        targetY,
        targetPosition: targetPosition as Position,
      });

  // ── Label editing ──────────────────────────────────────────────
  const handleSubmitLabel = (value: string) => {
    setEditingEdgeId(null);
    const current = edgeData.label ?? "";
    if (value === current) return;
    updateCanvasEdge({
      edgeId: id,
      data: value ? { label: value } : { label: null },
    });
  };
  const handleCancelLabel = () => setEditingEdgeId(null);

  // ── Bend points ─────────────────────────────────────────────────
  const handleBendDrag = (bpId: string, x: number, y: number) => {
    setEdges((eds) =>
      eds.map((e) => {
        if (e.id !== id) return e;
        const d = (e.data ?? {}) as EdgeCustomData;
        const nextBps = (d.bendPoints ?? []).map((bp) =>
          bp.id === bpId ? { ...bp, x, y } : bp,
        );
        return { ...e, data: { ...d, bendPoints: nextBps } };
      }),
    );
  };

  const handleBendDragEnd = () => {
    const edge = getEdge(id);
    const d = (edge?.data ?? {}) as EdgeCustomData;
    const bps = d.bendPoints ?? [];
    if (bps.length === 0) return;
    updateCanvasEdge({
      edgeId: id,
      data: { bendPoints: bps },
    });
  };

  const handleBendRemove = (bpId: string) => {
    const edge = getEdge(id);
    const d = (edge?.data ?? {}) as EdgeCustomData;
    const filtered = (d.bendPoints ?? []).filter((bp) => bp.id !== bpId);
    updateCanvasEdge({
      edgeId: id,
      data: { bendPoints: filtered },
    });
  };

  const label = edgeData.label;

  // Halo bleu de sélection, même vocabulaire que `NodeFrame`
  // (`ring-2 ring-blue-500/70`) : la couleur de l'edge est préservée, le halo
  // se peint dessous en plein (même en pointillés) pour rester lisible.
  // `BaseEdge` pose le stroke en inline, donc le CSS xyflow
  // (`.selected .react-flow__edge-path`) est inopérant — d'où ce path explicite.
  const selectionHaloWidth = svgWidth + 6;

  return (
    <>
      {selected && (
        <path
          d={edgePath}
          fill="none"
          stroke="#3b82f6"
          strokeOpacity={0.35}
          strokeWidth={selectionHaloWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          pointerEvents="none"
        />
      )}
      <BaseEdge
        id={id}
        path={edgePath}
        markerStart={markerStart}
        markerEnd={markerEnd}
        interactionWidth={20}
        style={{
          stroke: hex,
          strokeWidth: svgWidth,
          ...(dashArray ? { strokeDasharray: dashArray } : null),
        }}
      />

      <EdgeLabelRenderer>
        {isEditing ? (
          <EdgeLabelEditor
            initialValue={label ?? ""}
            labelX={labelX}
            labelY={labelY}
            fontSize={labelFontSize}
            color={labelColor}
            borderColor={hex}
            onSubmit={handleSubmitLabel}
            onCancel={handleCancelLabel}
          />
        ) : (
          label && (
            <div
              style={{
                position: "absolute",
                transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
                pointerEvents: "all",
                fontSize: `${labelFontSize}px`,
                fontWeight: 400,
                color: labelColor,
                background: "#ffffff",
                padding: "1px 8px",
                borderRadius: 10,
                border: `1px solid ${hex}`,
                // Même vocabulaire que le halo du trait : le pill du label
                // prend le ring bleu quand l'edge est sélectionnée.
                ...(selected
                  ? { boxShadow: "0 0 0 2px rgba(59, 130, 246, 0.7)" }
                  : null),
                maxWidth: 200,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              className="nodrag nopan"
              title={label}
            >
              {label}
            </div>
          )
        )}

        {selected && bendPoints.length > 0 && (
          <>
            {bendPoints.map((bp) => (
              <EdgeBendHandle
                key={bp.id}
                bendPoint={bp}
                onDrag={(x, y) => handleBendDrag(bp.id, x, y)}
                onDragEnd={handleBendDragEnd}
                onRemove={() => handleBendRemove(bp.id)}
              />
            ))}
          </>
        )}
      </EdgeLabelRenderer>
    </>
  );
}

export default memo(CustomEdge);
