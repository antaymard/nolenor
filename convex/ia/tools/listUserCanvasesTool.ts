import { createTool } from "@convex-dev/agent";
import { z } from "zod";
import { type ToolConfig, toolError } from "./toolHelpers";
import { toolAgentNames, type ThreadCtx } from "../agentConfig";
import { internal } from "../../_generated/api";

// Worker cannot run subtasks itself.
export const listUserCanvasesToolConfig: ToolConfig = {
  name: "list_user_canvases",
  authorized_agents: [
    toolAgentNames.nole,
    toolAgentNames.clone,
    toolAgentNames.supervisor,
  ],
};

export default function listUserCanvasesTool({
  threadCtx,
}: {
  threadCtx: ThreadCtx;
}) {
  return createTool({
    description: `Use this to list all canvases created by the user. This will return a list of canvas IDs, with their titles and descriptions. Use this canvasIDs to run SubAgents on other canvases, as you cannot go beyond the current canvas yourself.`,
    inputSchema: z.object(),
    execute: async (ctx) => {
      try {
        // For now, only list canvases whose creator is the user (not shared canvases)
        const canvases = await ctx.runQuery(
          internal.wrappers.canvasWrappers.listUserCanvases,
          {
            userId: threadCtx.authUserId,
          },
        );
        return canvases;
      } catch (error: any) {
        console.error("🔧 ListUserCanvases error:", error);
        return toolError(
          `Error listing user canvases: ${error.message}. Please try again.`,
        );
      }
    },
  });
}
