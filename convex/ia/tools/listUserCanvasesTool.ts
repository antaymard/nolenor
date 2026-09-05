import { createTool } from "@convex-dev/agent";
import { z } from "zod";
import { EXPLANATION_FIELD, type ToolConfig, toolError } from "./toolHelpers";
import { toolAgentNames, type ThreadCtx } from "../agentConfig";
import { internal } from "../../_generated/api";

export const listUserCanvasesToolConfig: ToolConfig = {
  name: "list_user_canvases",
  authorized_agents: [
    toolAgentNames.nole,
  ],
};

export default function listUserCanvasesTool({
  threadCtx,
}: {
  threadCtx: ThreadCtx;
}) {
  return createTool({
    description: `Use this to list all canvases created by the user. This returns their IDs, titles and descriptions. Read-only context on what the user works on elsewhere: you cannot read or edit another canvas, only the current one.`,
    inputSchema: z.object({ explanation: EXPLANATION_FIELD }),
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
      } catch (error) {
        console.error("🔧 ListUserCanvases error:", error);
        const message = error instanceof Error ? error.message : String(error);
        return toolError(
          `Error listing user canvases: ${message}. Please try again.`,
        );
      }
    },
  });
}
