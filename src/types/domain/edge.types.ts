import type { colorsEnum } from "./style.types";

/**
 * Edge visual types
 */
export type EdgeStrokeWidth = "thin" | "thick";
export type EdgeStrokeStyle = "solid" | "dashed" | "dotted";
export type EdgeMarker = "none" | "arrow";

/**
 * A draggable control point used to deform an edge's path.
 * Coordinates are in flow space (same as node positions).
 */
export interface EdgeBendPoint {
  id: string;
  x: number;
  y: number;
}

/**
 * Custom data for edges - used for edge styling and labels
 */
export interface EdgeCustomData {
  label?: string;
  color?: colorsEnum;
  strokeWidth?: EdgeStrokeWidth;
  strokeStyle?: EdgeStrokeStyle;
  bendPoints?: EdgeBendPoint[];
  markerStart?: EdgeMarker;
  markerEnd?: EdgeMarker;
  [key: string]: unknown;
}
