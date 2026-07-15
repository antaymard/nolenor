import type {
  EdgeStrokeWidth,
  EdgeStrokeStyle,
  colorsEnum,
} from "@/types/domain";
import type { Edge, EdgeMarker } from "@xyflow/react";
import { colors } from "@/components/ui/styles";

/**
 * Maps a thickness key to:
 *  - `svgWidth`: the SVG stroke-width applied to the edge path
 *  - `labelFontSize`: the font-size (px) of the edge label, tied to thickness
 *    per the product spec ("thickness defines label font size if any").
 */
export const edgeStrokeWidthMap: Record<
  EdgeStrokeWidth,
  { svgWidth: number; labelFontSize: number }
> = {
  thin: { svgWidth: 1, labelFontSize: 14 },
  thick: { svgWidth: 2, labelFontSize: 18 },
};

/**
 * Maps a stroke style key to an SVG `stroke-dasharray` value.
 * `solid` maps to `undefined` so the CSS default (no dash) applies.
 */
export const edgeDashArrayMap: Record<EdgeStrokeStyle, string | undefined> = {
  solid: undefined,
  dashed: "8 4",
  dotted: "2 4",
};

export const DEFAULT_EDGE_COLOR: colorsEnum = "default";
export const DEFAULT_EDGE_STROKE_WIDTH: EdgeStrokeWidth = "thin";
export const DEFAULT_EDGE_STROKE_STYLE: EdgeStrokeStyle = "solid";

/** Maximum number of bend points allowed on a single edge. */
export const MAX_BEND_POINTS = 3;

/**
 * Resolves the hex color for an edge given its (possibly undefined) color key.
 * Falls back to the default edge color.
 */
export function getEdgeHexColor(color: colorsEnum | undefined): string {
  return colors[color ?? DEFAULT_EDGE_COLOR].hex;
}

/**
 * Injects the edge's hex color into its `markerStart` / `markerEnd` objects so
 * that React Flow's `MarkerDefinitions` renders arrows in the edge's color
 * instead of the default grey.
 *
 * Markers passed as strings (custom marker ids) are left untouched.
 */
export function injectMarkerColor<T extends Edge>(edges: T[]): T[] {
  return edges.map((edge) => {
    const data = (edge.data ?? {}) as { color?: colorsEnum };
    const hex = getEdgeHexColor(data.color);
    const withColor = (marker: T["markerEnd"]): T["markerEnd"] =>
      marker && typeof marker === "object"
        ? ({ ...(marker as EdgeMarker), color: hex } as EdgeMarker)
        : marker;
    return {
      ...edge,
      markerStart: withColor(edge.markerStart),
      markerEnd: withColor(edge.markerEnd),
    };
  });
}
