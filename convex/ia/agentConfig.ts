import { Id } from "../_generated/dataModel";

export const toolAgentNames = {
  nole: "nolë",
  clone: "clone",
  supervisor: "supervisor",
  worker: "worker",
  // Pas un agent LLM : identifie les appels venant du serveur MCP.
  // L'exposition MCP est pilotée par ToolConfig.mcp, pas par authorized_agents.
  mcp: "mcp",
} as const;

export type ToolAgentName =
  (typeof toolAgentNames)[keyof typeof toolAgentNames];

export type ThreadCtx = {
  authUserId: Id<"users">;
  canvasId: Id<"canvases">;
};
