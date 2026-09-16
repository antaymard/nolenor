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
    description: `List every canvas the user can reach — the ones they created and the ones shared with them — with their IDs, names, descriptions and your permission on each ("owner", "editor" or "viewer").

    Use the IDs as the canvasId argument of run_subagent: that is the only way to read or edit a canvas other than the current one. Your own tools stay bound to the current canvas.

    Permission matters: run_subagent needs "editor" or "owner" on the target. A "viewer" canvas will be refused.`,
    inputSchema: z.object({ explanation: EXPLANATION_FIELD }),
    execute: async (ctx) => {
      try {
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
