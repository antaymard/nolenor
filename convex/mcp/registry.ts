// Vue MCP du registre de tools de Nole. Fichier V8-safe : importer le
// registre bundle les tools sans les exécuter (les helpers Node comme
// blockNoteMarkdown ne chargent leurs dépendances qu'à l'exécution).
import type { z } from "zod";
import type { Id } from "../_generated/dataModel";
import { toolAgentNames, type ThreadCtx } from "../ia/agentConfig";
import { agentToolRegistry } from "../ia/tools/index";

export type McpToolAccess = "read" | "write";
export type McpTokenPermission = "read" | "write";

export type McpRegistryEntry = (typeof agentToolRegistry)[number];

/** Un token `read` ne voit que les tools read ; un token `write` voit tout. */
export function isAccessAllowed(
  permission: McpTokenPermission,
  access: McpToolAccess,
): boolean {
  return permission === "write" || access === "read";
}

export function getMcpEntries(
  permission: McpTokenPermission,
): { entry: McpRegistryEntry; access: McpToolAccess }[] {
  const entries: { entry: McpRegistryEntry; access: McpToolAccess }[] = [];
  for (const entry of agentToolRegistry) {
    const mcp = entry.config.mcp;
    if (!mcp || !isAccessAllowed(permission, mcp.access)) {
      continue;
    }
    entries.push({ entry, access: mcp.access });
  }
  return entries;
}

export function findMcpEntry(toolName: string): McpRegistryEntry | null {
  const entry = agentToolRegistry.find(
    (candidate) => candidate.config.name === toolName,
  );
  return entry?.config.mcp ? entry : null;
}

/**
 * Instancie le tool AI SDK d'une entrée du registre. Les factories ne font
 * que fermer sur threadCtx (aucun effet de bord), on peut donc construire un
 * tool "témoin" avec des ids vides juste pour lire description + inputSchema.
 */
export function buildTool(entry: McpRegistryEntry, threadCtx: ThreadCtx) {
  return entry.factory({ agentName: toolAgentNames.mcp, threadCtx });
}

const WITNESS_THREAD_CTX: ThreadCtx = {
  authUserId: "" as Id<"users">,
  canvasId: "" as Id<"canvases">,
};

export function buildWitnessTool(entry: McpRegistryEntry) {
  return buildTool(entry, WITNESS_THREAD_CTX);
}

/** Tous les tools de Nole déclarent un z.object comme inputSchema. */
export function getZodObjectSchema(
  tool: NonNullable<ReturnType<typeof buildTool>>,
): z.ZodObject<z.ZodRawShape> | null {
  const schema = tool.inputSchema as z.ZodObject<z.ZodRawShape> | undefined;
  if (!schema || typeof schema !== "object" || !("shape" in schema)) {
    return null;
  }
  return schema;
}
