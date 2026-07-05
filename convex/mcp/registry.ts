import { z } from "zod";
import type { Tool } from "ai";
import type { Id } from "../_generated/dataModel";
import { toolAgentNames, type ThreadCtx } from "../ia/agentConfig";
import { agentToolRegistry } from "../ia/tools";

/**
 * Registre des tools exposés via le serveur MCP (voir convex/mcp/server.ts).
 * Il dérive entièrement du toolRegistry des agents : un tool est exposé si sa
 * ToolConfig porte un champ `mcp` (voir toolHelpers.ts). Le canvas ciblé est
 * choisi par le client MCP via un argument `canvas_id` injecté dans le schéma.
 */

export const CANVAS_ID_ARG = "canvas_id";

// Tools qui opèrent sur l'ensemble du compte et non sur un canvas : pas de
// paramètre canvas_id injecté, pas de vérification d'accès canvas. Leur
// threadCtx.canvasId n'est jamais lu.
const GLOBAL_TOOL_NAMES = new Set(["list_user_canvases"]);

export type McpToolRegistration = {
  name: string;
  /** Permission canvas minimale exigée pour appeler ce tool. */
  access: "viewer" | "editor";
  global: boolean;
  buildTool: (threadCtx: ThreadCtx) => Tool;
};

export const mcpToolRegistry: McpToolRegistration[] = agentToolRegistry
  .filter(
    (registration) =>
      registration.config.mcp !== undefined &&
      !registration.config.requireMultiModal,
  )
  .map((registration) => ({
    name: registration.config.name,
    access: registration.config.mcp!.access,
    global: GLOBAL_TOOL_NAMES.has(registration.config.name),
    buildTool: (threadCtx: ThreadCtx) => {
      const tool = registration.factory({
        agentName: toolAgentNames.mcp,
        threadCtx,
      });
      if (!tool) {
        throw new Error(`MCP tool "${registration.config.name}" unavailable`);
      }
      return tool as Tool;
    },
  }));

export function getMcpToolRegistration(
  name: string,
): McpToolRegistration | undefined {
  return mcpToolRegistry.find((entry) => entry.name === name);
}

// Les factories sont pures (elles ne font que capturer le threadCtx en
// closure), on peut donc instancier avec un contexte factice juste pour lire
// description et inputSchema.
const placeholderThreadCtx: ThreadCtx = {
  authUserId: "placeholder" as Id<"users">,
  canvasId: "placeholder" as Id<"canvases">,
};

function toInputJsonSchema(inputSchema: unknown): Record<string, unknown> {
  if (inputSchema instanceof z.ZodType) {
    const jsonSchema = z.toJSONSchema(inputSchema, {
      io: "input",
      unrepresentable: "any",
    }) as Record<string, unknown>;
    delete jsonSchema.$schema;
    if (jsonSchema.type !== "object") {
      return { type: "object", properties: {} };
    }
    return jsonSchema;
  }
  return { type: "object", properties: {} };
}

function injectCanvasIdArg(schema: Record<string, unknown>) {
  const properties = {
    ...((schema.properties as Record<string, unknown>) ?? {}),
    [CANVAS_ID_ARG]: {
      type: "string",
      description:
        "ID of the target canvas. Use the list_user_canvases tool to discover available canvas IDs.",
    },
  };
  const required = Array.isArray(schema.required) ? schema.required : [];
  return {
    ...schema,
    properties,
    required: [...required, CANVAS_ID_ARG],
  };
}

/** Descripteurs `tools/list` au format MCP (JSON Schema draft 2020-12). */
export function listMcpTools() {
  return mcpToolRegistry.map((entry) => {
    const tool = entry.buildTool(placeholderThreadCtx);
    let inputSchema = toInputJsonSchema(tool.inputSchema);
    if (!entry.global) {
      inputSchema = injectCanvasIdArg(inputSchema);
    }
    return {
      name: entry.name,
      description: tool.description ?? "",
      inputSchema,
      annotations: {
        readOnlyHint: entry.access === "viewer",
      },
    };
  });
}
