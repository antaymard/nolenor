// Shared helpers for tool error formatting and compaction logic
import { z } from "zod";
import type { ToolAgentName } from "../agentConfig";

export const EXPLANATION_FIELD = z
  .string()
  .describe(
    'Required. One first-person sentence stating what you are about to do with this call, e.g. "I will insert a new paragraph after the introduction."',
  );

export type NodeRect = {
  id: string;
  position: { x: number; y: number };
  width: number;
  height: number;
};

type Side = "l" | "r" | "t" | "b";

function getSidePoint(rect: NodeRect, side: Side): { x: number; y: number } {
  const centerX = rect.position.x + rect.width / 2;
  const centerY = rect.position.y + rect.height / 2;

  switch (side) {
    case "l":
      return { x: rect.position.x, y: centerY };
    case "r":
      return { x: rect.position.x + rect.width, y: centerY };
    case "t":
      return { x: centerX, y: rect.position.y };
    case "b":
      return { x: centerX, y: rect.position.y + rect.height };
  }
}

function distanceSquared(
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export function getClosestHandlesForDirectedEdge({
  from,
  to,
}: {
  from: NodeRect;
  to: NodeRect;
}): {
  sourceHandle: string;
  targetHandle: string;
} {
  const sides: Side[] = ["l", "r", "t", "b"];

  let best:
    | {
        sourceSide: Side;
        targetSide: Side;
        distance: number;
      }
    | undefined;

  for (const sourceSide of sides) {
    for (const targetSide of sides) {
      const sourcePoint = getSidePoint(from, sourceSide);
      const targetPoint = getSidePoint(to, targetSide);
      const d2 = distanceSquared(sourcePoint, targetPoint);

      if (!best || d2 < best.distance) {
        best = {
          sourceSide,
          targetSide,
          distance: d2,
        };
      }
    }
  }

  const sourceSide = best?.sourceSide ?? "r";
  const targetSide = best?.targetSide ?? "l";

  return {
    sourceHandle: `${from.id}_s${sourceSide}`,
    targetHandle: `${to.id}_t${targetSide}`,
  };
}

export interface CompactionConfig {
  compactAfterMessages: number;
  compactAfterIterations: number; // -1 is never, 0 is always
  toolUseCompaction?: (toolUse: unknown) => string;
  toolResultCompaction?: (toolResult: unknown) => string;
  hideCompletelyAfterMessages?: number;
}

export interface ToolConfig {
  name: string;
  authorized_agents: ToolAgentName[];
  requireMultiModal?: boolean;
  compactionForSuccessResult?: CompactionConfig;
  compactionForFailureResult?: CompactionConfig;
  /**
   * Présent = le tool est exposé sur le endpoint MCP (/mcp).
   * `access` est confronté à la permission du token API ("read" | "write") :
   * un token read ne voit que les tools read. Les tools MCP sont
   * canvas-scoped : le serveur MCP ajoute un argument `canvasId` au schéma
   * et vérifie l'accès au canvas (read → viewer, write → editor) avant
   * chaque exécution.
   */
  mcp?: { access: "read" | "write" };
}

const defaultCompactionConfig: CompactionConfig = {
  compactAfterMessages: 0,
  compactAfterIterations: -1,
};

export function createDefaultToolConfig(
  name: string,
  agents: ToolAgentName[],
): ToolConfig {
  return {
    name,
    authorized_agents: agents,
    compactionForSuccessResult: defaultCompactionConfig,
    compactionForFailureResult: defaultCompactionConfig,
  };
}

/** Extract compact error hint from the uniform {success:false, message} JSON error format. */
export function compactErrorResult(
  toolName: string,
  toolResult: unknown,
): string {
  try {
    const parsed =
      typeof toolResult === "string" ? JSON.parse(toolResult) : toolResult;
    if (parsed?.message) {
      const msg =
        parsed.message.length > 80
          ? `${parsed.message.slice(0, 80)}…`
          : parsed.message;
      return `[${toolName} error: ${msg}]`;
    }
  } catch {
    // not JSON
  }
  const str = typeof toolResult === "string" ? toolResult : String(toolResult);
  return `[${toolName} error: ${str.slice(0, 80)}]`;
}

export function toolError(message: string): string {
  return JSON.stringify({ success: false, message });
}

// Re-exported so the existing tool call sites keep importing it from here,
// while the single implementation lives in `convex/lib/text.ts` (also used by
// the BlockNote document layer).
export { countExactMatches } from "../../lib/text";
