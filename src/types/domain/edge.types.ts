import type { colorsEnum } from "./style.types";

/**
 * Edge visual types
 */
export type EdgeStrokeWidth = "thin" | "regular" | "thick";
export type EdgeMarker = "none" | "arrow";

/**
 * Custom data for edges - used for edge styling and labels
 */
export interface EdgeCustomData {
  label?: string;
  color?: colorsEnum;
  strokeWidth?: EdgeStrokeWidth;
  markerStart?: EdgeMarker;
  markerEnd?: EdgeMarker;
  [key: string]: unknown;
}
