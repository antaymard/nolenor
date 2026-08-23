// Shared helpers for tool error formatting and compaction logic
import { z } from "zod";
import type { ToolAgentName } from "../agentConfig";

/**
 * L'étiquette lisible d'un tool call. Portée par l'entrée de tous les tools,
 * affichée telle quelle à trois endroits : la conversation (`ToolPart`), le dock
 * d'activité et les marqueurs du canvas.
 *
 * Un groupe nominal, et non une phrase à la première personne : l'étiquette est
 * rédigée AVANT l'exécution mais reste affichée APRÈS, comme résumé de ce que la
 * tâche a fait. « Je vais ajouter un paragraphe » se périme à la seconde où le
 * paragraphe existe ; « Ajout d'un paragraphe » ne se périme jamais. C'est ce
 * qui permet aux pastilles de garder le même libellé pendant et après le tour,
 * sans deuxième champ ni réécriture.
 */
export const EXPLANATION_FIELD = z
  .string()
  .describe(
    "Required. A short, dense label for this call, shown to the user as-is. " +
      "Write a noun phrase, not a sentence: no first person, no verb tense — it " +
      "is displayed both while the call runs and afterwards as a summary of what " +
      "was done. Name the action and its target, under 60 characters, in the " +
      "user's language. Good: \"Ajout d'un paragraphe après l'intro\", " +
      "\"Recherche des sources 2024\", \"Lecture des 3 nodes sélectionnés\". " +
      "Bad: \"I will insert a new paragraph after the introduction.\"",
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

export interface ToolConfig {
  name: string;
  authorized_agents: ToolAgentName[];
  requireMultiModal?: boolean;
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

// ── Error shaping ───────────────────────────────────────────────────────────
//
// A tool error is read by the model, and every character of it is context it
// pays for on every subsequent turn of the thread. Two things make an
// unshaped error enormous:
//
//  • Convex's value-validation errors embed the ENTIRE argument object after
//    "in original object" — for a blocknote edit that is the whole document,
//    thousands of tokens, none of them actionable. The diagnosis (the value
//    and its path) comes BEFORE the dump, so cutting there loses nothing.
//  • Anything else that happens to be long. A hard cap bounds the worst case.

const CONVEX_ARGUMENT_DUMP = / in original object [\s\S]*$/;

/** Generous enough for the longest useful message (BlockNotFoundError's id list). */
const MAX_TOOL_ERROR_CHARS = 1000;

function compactErrorMessage(message: string): string {
  const compacted = message.replace(CONVEX_ARGUMENT_DUMP, ").");
  return compacted.length > MAX_TOOL_ERROR_CHARS
    ? `${compacted.slice(0, MAX_TOOL_ERROR_CHARS)}… [truncated]`
    : compacted;
}

export function toolError(message: string): string {
  return JSON.stringify({ success: false, message: compactErrorMessage(message) });
}

// Re-exported so the existing tool call sites keep importing it from here,
// while the single implementation lives in `convex/lib/text.ts` (also used by
// the BlockNote document layer).
export { countExactMatches } from "../../lib/text";
