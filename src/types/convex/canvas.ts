/**
 * Canvas types derived from Convex Doc<"canvases">
 */

import type { Doc } from "@/../convex/_generated/dataModel";

export type Canvas = Doc<"canvases">;
export type CanvasNode = NonNullable<Doc<"canvases">["nodes"]>[number];
export type Edge = NonNullable<Doc<"canvases">["edges"]>[number];
