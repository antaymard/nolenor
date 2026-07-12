import {type Id} from "../_generated/dataModel";

export const toolAgentNames = {
  nole: "nolë",
  clone: "clone",
  supervisor: "supervisor",
  worker: "worker",
} as const;

export type ToolAgentName =
  (typeof toolAgentNames)[keyof typeof toolAgentNames];

export type ThreadCtx = {
  authUserId: Id<"users">;
  canvasId: Id<"canvases">;
};
