import type { EdgeTypes } from "@xyflow/react";
import CustomEdge from "./CustomEdge";

/**
 * Edge type registry consumed by `<ReactFlow edgeTypes={edgeTypes}>`.
 *
 * We override the `"default"` type so all existing edges (which have no
 * explicit `type` field) render through `CustomEdge` without any data
 * migration. An edge with no `data` falls back to the defaults
 * (slate color, regular width, solid, bezier path) — visually identical
 * to xyflow's built-in default edge.
 */
export const edgeTypes: EdgeTypes = {
  default: CustomEdge,
};
