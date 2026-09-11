import type { Id } from "@/../convex/_generated/dataModel";
import type { NodeType } from "../domain/nodeTypes";

export interface Window {
  nodeId: string; // Node Id (not _id)
  nodeDataId?: Id<"nodeDatas">;
  type: NodeType;
  isMinimized?: boolean;
  isExpanded?: boolean;
}

// TO REMOVE
export type ResizeDirection =
  | "tl"
  | "tc"
  | "tr"
  | "ml"
  | "mr"
  | "bl"
  | "bc"
  | "br";
