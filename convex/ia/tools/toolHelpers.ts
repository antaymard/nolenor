// Shared helpers for tool error formatting and compaction logic
import type { ToolAgentName } from "../agentConfig";

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

/** Count non-overlapping exact occurrences of `search` in `source`. */
export function countExactMatches(source: string, search: string): number {
  if (!search) return 0;
  let count = 0;
  let index = 0;
  while (true) {
    const found = source.indexOf(search, index);
    if (found === -1) break;
    count += 1;
    index = found + search.length;
  }
  return count;
}
