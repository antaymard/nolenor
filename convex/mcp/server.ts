// Construction du serveur MCP (protocole uniquement — V8). Les schémas et
// descriptions viennent directement des tools de Nole via le registre ;
// l'exécution est déléguée à l'action Node internal.mcp.execute.run.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ConvexError } from "convex/values";
import { z } from "zod";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { toolError } from "../ia/tools/toolHelpers";
import {
  buildWitnessTool,
  getMcpEntries,
  getZodObjectSchema,
  type McpTokenPermission,
} from "./registry";

export type McpAuth = {
  userId: Id<"users">;
  permission: McpTokenPermission;
};

const SERVER_INFO = { name: "nolenor", version: "0.1.0" };

const INSTRUCTIONS = `Nolênor is a visual canvas workspace. Each canvas holds nodes (blocknote documents, tables, images, apps…) optionally linked by connections (edges).

Typical workflow: call list_canvases to get canvas IDs, then list_nodes / read_nodes / search_canvas to explore a canvas, then the write tools (create_node, create_connection, set_node_data, block / table tools) to edit it.

Every tool except list_canvases requires a canvasId argument. Write tools require an API token with "write" permission and editor access to the canvas.

The user may paste node references copied from the app, such as "canvasId:abc|nodeIds:n1,n2", "canvasId:abc|nodeId:n1" or "nodeId:n1" (fields separated by "|", ids by ","). Pass these values as the canvasId and nodeIds arguments (e.g. to read_nodes). When no canvasId is given, ask the user which canvas (list_canvases lists them).`;

const CANVAS_ID_FIELD = z
  .string()
  .describe(
    "ID of the canvas to operate on. Use the list_canvases tool to discover available canvas IDs.",
  );

function errorText(error: unknown): string {
  if (error instanceof ConvexError) {
    return typeof error.data === "string"
      ? error.data
      : JSON.stringify(error.data);
  }
  return error instanceof Error ? error.message : String(error);
}

/** Les tools signalent leurs échecs via toolError → {success:false,...}. */
function isToolErrorText(text: string): boolean {
  if (!text.startsWith("{")) return false;
  try {
    const parsed: unknown = JSON.parse(text);
    return (
      typeof parsed === "object" &&
      parsed !== null &&
      (parsed as { success?: unknown }).success === false
    );
  } catch {
    return false;
  }
}

function toCallToolResult(text: string) {
  return {
    content: [{ type: "text" as const, text }],
    ...(isToolErrorText(text) ? { isError: true } : {}),
  };
}

export function buildMcpServer(ctx: ActionCtx, auth: McpAuth): McpServer {
  const server = new McpServer(SERVER_INFO, { instructions: INSTRUCTIONS });

  server.registerTool(
    "list_canvases",
    {
      description:
        "List all canvases created by the user, with their IDs, names and descriptions. Use the returned IDs as the canvasId argument of the other tools.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => {
      try {
        const canvases = await ctx.runQuery(
          internal.wrappers.canvasWrappers.listUserCanvases,
          { userId: auth.userId },
        );
        return toCallToolResult(JSON.stringify(canvases, null, 2));
      } catch (error) {
        return toCallToolResult(toolError(errorText(error)));
      }
    },
  );

  for (const { entry, access } of getMcpEntries(auth.permission)) {
    const witness = buildWitnessTool(entry);
    if (!witness) continue;
    const schema = getZodObjectSchema(witness);
    if (!schema) continue;

    const toolName = entry.config.name;
    server.registerTool(
      toolName,
      {
        description: witness.description,
        inputSchema: { canvasId: CANVAS_ID_FIELD, ...schema.shape },
        annotations: { readOnlyHint: access === "read" },
      },
      async (args, extra) => {
        const { canvasId, ...input } = args as { canvasId: string } & Record<
          string,
          unknown
        >;
        try {
          const result = await ctx.runAction(internal.mcp.execute.run, {
            toolName,
            userId: auth.userId,
            canvasId: canvasId as Id<"canvases">,
            permission: auth.permission,
            input,
            toolCallId: String(extra.requestId),
          });
          return toCallToolResult(result);
        } catch (error) {
          return toCallToolResult(toolError(errorText(error)));
        }
      },
    );
  }

  return server;
}
