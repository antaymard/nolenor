"use node";
// Exécution des tool calls MCP. Action Node car certains tools (blocknote,
// set_node_data) chargent jsdom/@blocknote/core via require() à l'exécution —
// même runtime que les actions de Nole (noleCompletion, worker).
import type { ToolCtx } from "@convex-dev/agent";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { toolError } from "../ia/tools/toolHelpers";
import { buildTool, findMcpEntry, isAccessAllowed } from "./registry";

async function resolveToolOutput(raw: unknown): Promise<unknown> {
  const resolved = await Promise.resolve(raw);
  if (
    resolved !== null &&
    typeof resolved === "object" &&
    Symbol.asyncIterator in resolved
  ) {
    let last: unknown = null;
    for await (const chunk of resolved as AsyncIterable<unknown>) {
      last = chunk;
    }
    return last;
  }
  return resolved;
}

export const run = internalAction({
  args: {
    toolName: v.string(),
    userId: v.id("users"),
    canvasId: v.id("canvases"),
    permission: v.union(v.literal("read"), v.literal("write")),
    input: v.record(v.string(), v.any()),
    toolCallId: v.string(),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const entry = findMcpEntry(args.toolName);
    if (!entry || !entry.config.mcp) {
      return toolError(`Unknown MCP tool: ${args.toolName}`);
    }
    const access = entry.config.mcp.access;
    if (!isAccessAllowed(args.permission, access)) {
      return toolError(
        `This API token has "${args.permission}" permission and cannot call the "${args.toolName}" tool.`,
      );
    }

    // Même contrôle qu'à l'entrée de Nole : viewer suffit pour lire,
    // editor requis pour écrire. Throw ConvexError si refusé (relayé en
    // erreur de tool par le endpoint).
    await ctx.runQuery(internal.mcp.access.assertCanvasAccess, {
      canvasId: args.canvasId,
      userId: args.userId,
      minPermission: access === "read" ? "viewer" : "editor",
    });

    const tool = buildTool(entry, {
      authUserId: args.userId,
      canvasId: args.canvasId,
    });
    if (!tool) {
      return toolError(`Tool "${args.toolName}" is not available.`);
    }

    // Les tools créés par createTool lisent leur ctx sur `this.ctx` (c'est ce
    // que fait wrapTools de @convex-dev/agent, non ré-exporté publiquement).
    const toolCtx: ToolCtx = { ...ctx, userId: args.userId };
    const wrapped = { ...tool, ctx: toolCtx };
    if (!wrapped.execute) {
      return toolError(`Tool "${args.toolName}" is not executable.`);
    }

    // L'input a déjà été validé contre le schéma zod du tool par le SDK MCP
    // côté endpoint ; on ne re-parse pas ici.
    const output = await resolveToolOutput(
      wrapped.execute(args.input, {
        toolCallId: args.toolCallId,
        messages: [],
      }),
    );

    return typeof output === "string" ? output : JSON.stringify(output);
  },
});
