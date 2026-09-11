/**
 * Canvas types derived from Convex
 */

import type { Doc } from "@/../convex/_generated/dataModel";
import type { CanvasEdge } from "@/../convex/schemas/edgesSchema";

export type Canvas = Doc<"canvases">;

// DTO node/edge « canvas » (cf. `toCanvasNode`/`toCanvasEdge`) : la forme
// persistée vit dans les tables `nodes`/`edges`, plus dans le doc canvases.
export type { CanvasNode } from "@/../convex/schemas/nodesSchema";
export type { CanvasEdge } from "@/../convex/schemas/edgesSchema";

/** Alias historique front : l'edge « canvas » consommée par React Flow. */
export type Edge = CanvasEdge;
