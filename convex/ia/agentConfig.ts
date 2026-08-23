import {type Id} from "../_generated/dataModel";

export const toolAgentNames = {
  nole: "nolë",
  worker: "worker",
  // Assistant tiers connecté via le endpoint MCP (/mcp). Jamais listé dans
  // authorized_agents : l'exposition MCP est gouvernée par ToolConfig.mcp.
  mcp: "mcp",
} as const;

export type ToolAgentName =
  (typeof toolAgentNames)[keyof typeof toolAgentNames];

export type ThreadCtx = {
  authUserId: Id<"users">;
  canvasId: Id<"canvases">;
};
