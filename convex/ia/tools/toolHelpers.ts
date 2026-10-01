// Shared helpers for tool error formatting and compaction logic
import type { ToolCtx } from "@convex-dev/agent";
import { z } from "zod";
import type { ToolAgentName } from "../agentConfig";

// ── Le ctx d'un tool ────────────────────────────────────────────────────────
//
// Il ne vit pas dans la définition du tool. Le composant agent recopie chaque
// tool en y ajoutant `ctx` juste avant la génération (`wrapTools`, non
// ré-exporté publiquement), et l'`execute` que produit `createTool` le relit
// sur `this`.
//
// Deux chemins ont besoin de connaître ce détail d'implémentation : l'exécution
// MCP, qui construit son ctx à la main, et l'enveloppe de traçage d'activité,
// qui le lit. Il n'est écrit qu'ici.

/** Pose le ctx sur un tool, comme le fait le composant agent avant d'appeler. */
export function attachToolCtx<T extends object>(tool: T, ctx: ToolCtx): T {
  return { ...tool, ctx };
}

/**
 * Le pendant en lecture : le `this` d'un `execute` porte le ctx.
 *
 * Rend `undefined` plutôt que de throw — un tool appelé hors du composant agent
 * n'a rien d'anormal, c'est le chemin MCP.
 */
export function readToolCtx(toolThis: unknown): ToolCtx | undefined {
  if (typeof toolThis !== "object" || toolThis === null) return undefined;
  return (toolThis as { ctx?: ToolCtx }).ctx;
}

/**
 * L'étiquette lisible d'un tool call. Portée par l'entrée de tous les tools,
 * affichée telle quelle à trois endroits : la conversation (bloc d'activité du
 * panneau Nolë), le dock d'activité et les marqueurs du canvas.
 *
 * Toujours la PREMIÈRE clé de l'`inputSchema`. Le modèle écrit les arguments
 * dans l'ordre du schéma, et la conversation affiche l'étiquette dès qu'elle
 * arrive dans le flux : placée après un gros contenu (XML de blocs, lignes de
 * table, code), elle n'apparaîtrait qu'à la fin, et l'utilisateur regarderait
 * un libellé générique pendant tout l'appel.
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
      "user's language. Good: \"Adding a paragraph after the intro\", " +
      "\"Searching for 2024 sources\", \"Reading the 3 selected nodes\". " +
      "Bad: \"I will insert a new paragraph after the introduction.\"",
  );

// ── Labels d'edge ───────────────────────────────────────────────────────────
//
// Le label vit dans `edge.data.label`, comme l'écrit l'éditeur inline du
// canvas (`CustomEdge`). Effacé côté UI, il est patché à `null` — la fusion
// shallow de `patchEdge` le laisse en base : on le lit donc comme « absent ».
// L'agent les lit, mais n'en écrit plus (cf. `create_connection`).

/** Le label d'une edge, `null` s'il est absent, effacé ou vide. */
export function getEdgeLabel(edge: {
  data?: Record<string, unknown>;
}): string | null {
  const label = edge.data?.label;
  if (typeof label !== "string") return null;
  const trimmed = label.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export type NodeRect = {
  id: string;
  position: { x: number; y: number };
  width: number;
  height: number;
};

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
