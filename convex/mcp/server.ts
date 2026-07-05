import { ConvexError, v } from "convex/values";
import { z } from "zod";
import { httpAction, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { requireCanvasAccess } from "../lib/auth";
import { API_KEY_PREFIX, hashApiKey } from "../apiKeys";
import type { ThreadCtx } from "../ia/agentConfig";
import {
  CANVAS_ID_ARG,
  getMcpToolRegistration,
  listMcpTools,
} from "./registry";

/**
 * Serveur MCP (Model Context Protocol) stateless, transport Streamable HTTP.
 * Permet à un assistant tiers (Claude Code, Claude Desktop…) d'utiliser les
 * tools de Nolé sur les canvases de l'utilisateur, authentifié par API key
 * (voir convex/apiKeys.ts).
 *
 * Stateless : pas de Mcp-Session-Id ni de flux SSE serveur — chaque POST est
 * indépendant, ce qui suffit pour initialize / tools/list / tools/call.
 */

const LATEST_PROTOCOL_VERSION = "2025-06-18";
const SUPPORTED_PROTOCOL_VERSIONS = [
  LATEST_PROTOCOL_VERSION,
  "2025-03-26",
  "2024-11-05",
];

const SERVER_INSTRUCTIONS =
  "Nolênor is a canvas app where users organize documents, tables, apps and " +
  "other nodes on infinite canvases. Start with list_user_canvases to get " +
  `canvas IDs, then pass ${CANVAS_ID_ARG} to the other tools to browse, ` +
  "search, create and edit nodes on a canvas.";

// Throttle des mises à jour de lastUsedAt sur les clés API.
const KEY_TOUCH_INTERVAL_MS = 60 * 60 * 1000;

type JsonRpcId = string | number | null;

type JsonRpcParams = {
  protocolVersion?: unknown;
  name?: unknown;
  arguments?: unknown;
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function rpcResult(id: JsonRpcId, result: unknown): Response {
  return jsonResponse({ jsonrpc: "2.0", id, result });
}

function rpcError(id: JsonRpcId, code: number, message: string): Response {
  return jsonResponse({ jsonrpc: "2.0", id, error: { code, message } });
}

/** Erreur d'exécution d'un tool : au format résultat MCP (isError), pas au
 * format erreur JSON-RPC, pour que le LLM client puisse lire et corriger. */
function toolErrorResult(id: JsonRpcId, message: string): Response {
  return rpcResult(id, {
    content: [{ type: "text", text: message }],
    isError: true,
  });
}

function unauthorized(message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 401,
    headers: {
      "Content-Type": "application/json",
      "WWW-Authenticate": 'Bearer realm="nolenor-mcp"',
    },
  });
}

export const checkCanvasAccess = internalQuery({
  args: {
    canvasId: v.id("canvases"),
    userId: v.id("users"),
    minPermission: v.union(v.literal("viewer"), v.literal("editor")),
  },
  handler: async (ctx, args) => {
    await requireCanvasAccess(
      ctx,
      args.canvasId,
      args.userId,
      args.minPermission,
    );
    return null;
  },
});

export const mcpPost = httpAction(async (ctx, request) => {
  // --- Authentification par API key ---
  const authorization = request.headers.get("authorization") ?? "";
  const [scheme, token] = authorization.split(" ");
  if (
    scheme?.toLowerCase() !== "bearer" ||
    !token ||
    !token.startsWith(API_KEY_PREFIX)
  ) {
    return unauthorized(
      "Missing or invalid API key. Send 'Authorization: Bearer <key>' with a key created in Nolênor settings.",
    );
  }

  const auth = await ctx.runQuery(internal.apiKeys.validate, {
    keyHash: await hashApiKey(token),
  });
  if (!auth) {
    return unauthorized("Unknown or revoked API key.");
  }

  if (
    !auth.lastUsedAt ||
    Date.now() - auth.lastUsedAt > KEY_TOUCH_INTERVAL_MS
  ) {
    await ctx.runMutation(internal.apiKeys.touch, { keyId: auth.keyId });
  }

  // --- Enveloppe JSON-RPC ---
  let message: {
    jsonrpc?: unknown;
    id?: JsonRpcId;
    method?: unknown;
    params?: JsonRpcParams;
  };
  try {
    message = await request.json();
  } catch {
    return rpcError(null, -32700, "Parse error: invalid JSON.");
  }
  if (Array.isArray(message)) {
    // Le batching a été retiré du protocole en 2025-06-18.
    return rpcError(null, -32600, "JSON-RPC batching is not supported.");
  }
  if (message?.jsonrpc !== "2.0" || typeof message.method !== "string") {
    return rpcError(null, -32600, "Invalid JSON-RPC request.");
  }

  const id: JsonRpcId = message.id ?? null;
  const isNotification = message.id === undefined;
  if (isNotification) {
    // notifications/initialized, notifications/cancelled…
    return new Response(null, { status: 202 });
  }

  switch (message.method) {
    case "initialize": {
      const requested = message.params?.protocolVersion;
      const protocolVersion =
        typeof requested === "string" &&
        SUPPORTED_PROTOCOL_VERSIONS.includes(requested)
          ? requested
          : LATEST_PROTOCOL_VERSION;
      return rpcResult(id, {
        protocolVersion,
        capabilities: { tools: {} },
        serverInfo: { name: "nolenor", version: "1.0.0" },
        instructions: SERVER_INSTRUCTIONS,
      });
    }

    case "ping":
      return rpcResult(id, {});

    case "tools/list":
      return rpcResult(id, { tools: listMcpTools() });

    case "tools/call":
      return handleToolCall(ctx, id, message.params, auth.userId);

    default:
      return rpcError(id, -32601, `Method not found: ${message.method}`);
  }
});

async function handleToolCall(
  ctx: Parameters<Parameters<typeof httpAction>[0]>[0],
  id: JsonRpcId,
  params: JsonRpcParams | undefined,
  userId: Id<"users">,
): Promise<Response> {
  const toolName = params?.name;
  const entry =
    typeof toolName === "string" ? getMcpToolRegistration(toolName) : undefined;
  if (!entry) {
    return rpcError(id, -32602, `Unknown tool: ${String(toolName)}`);
  }

  const rawArguments = params?.arguments;
  const args: Record<string, unknown> =
    typeof rawArguments === "object" && rawArguments !== null
      ? { ...(rawArguments as Record<string, unknown>) }
      : {};

  let threadCtx: ThreadCtx;
  if (entry.global) {
    // Les tools globaux ne lisent jamais threadCtx.canvasId.
    threadCtx = { authUserId: userId, canvasId: "" as Id<"canvases"> };
  } else {
    const canvasId = args[CANVAS_ID_ARG];
    delete args[CANVAS_ID_ARG];
    if (typeof canvasId !== "string" || !canvasId) {
      return toolErrorResult(
        id,
        `Missing required argument "${CANVAS_ID_ARG}". Use list_user_canvases to get canvas IDs.`,
      );
    }
    try {
      await ctx.runQuery(internal.mcp.server.checkCanvasAccess, {
        canvasId: canvasId as Id<"canvases">,
        userId,
        minPermission: entry.access,
      });
    } catch (error) {
      return toolErrorResult(id, formatCaughtError(error));
    }
    threadCtx = { authUserId: userId, canvasId: canvasId as Id<"canvases"> };
  }

  // Injection du ctx comme le fait wrapTools() de @convex-dev/agent (non
  // exporté) : l'execute du tool lit `this.ctx`, posé ici en propriété.
  const built = entry.buildTool(threadCtx);
  const tool = { ...built, ctx: { ...ctx, userId } } as unknown as typeof built;

  // Le protocole ne valide pas les arguments côté client : on rejoue la
  // validation zod que le AI SDK ferait pour Nolé.
  let input: unknown = args;
  if (tool.inputSchema instanceof z.ZodType) {
    const parsed = tool.inputSchema.safeParse(args);
    if (!parsed.success) {
      return toolErrorResult(
        id,
        `Invalid arguments for ${entry.name}: ${z.prettifyError(parsed.error)}`,
      );
    }
    input = parsed.data;
  }

  try {
    const result = await tool.execute!(input, {
      toolCallId: `mcp-${Date.now().toString(36)}`,
      messages: [],
    });
    const text =
      typeof result === "string" ? result : JSON.stringify(result, null, 2);
    return rpcResult(id, {
      content: [{ type: "text", text }],
      isError: isToolErrorPayload(result),
    });
  } catch (error) {
    console.error(`MCP tools/call ${entry.name} failed:`, error);
    return toolErrorResult(id, formatCaughtError(error));
  }
}

/** Détecte le format d'erreur uniforme des tools ({ success: false, … }). */
function isToolErrorPayload(result: unknown): boolean {
  try {
    const parsed = typeof result === "string" ? JSON.parse(result) : result;
    return (
      typeof parsed === "object" &&
      parsed !== null &&
      (parsed as { success?: unknown }).success === false
    );
  } catch {
    return false;
  }
}

function formatCaughtError(error: unknown): string {
  if (error instanceof ConvexError) {
    return typeof error.data === "string"
      ? error.data
      : JSON.stringify(error.data);
  }
  // Erreurs de validation d'arguments Convex (ex : canvas_id malformé).
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("ArgumentValidationError")) {
    return `Invalid ${CANVAS_ID_ARG}: not a valid canvas ID.`;
  }
  return "Tool execution failed due to an internal error.";
}

export const mcpMethodNotAllowed = httpAction(async () => {
  // Serveur stateless : pas de flux SSE (GET) ni de session à terminer (DELETE).
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
});
