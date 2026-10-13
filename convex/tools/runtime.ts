import type { ActionCtx } from "../_generated/server";

/**
 * Ce dont un noyau a besoin : enchaîner des transactions depuis l'action qui
 * exécute le tool (Nolë, MCP, plus tard le CLI). Pas d'`ActionCtx` entier :
 * un noyau ne lance ni action, ni planification.
 */
export type ToolRunCtx = Pick<ActionCtx, "runQuery" | "runMutation">;

/**
 * Le nombre de documents lourds (nodeDatas) lus par transaction.
 *
 * Un document pèse au plus 1 Mio et une transaction lit au plus 16 Mio : par
 * lots de 10, aucune lecture ne peut dépasser la limite, quel que soit le
 * canvas. La structure du canvas (nodes, edges : petits documents) se lit
 * d'un bloc ; les contenus, jamais.
 */
export const CONTENT_BATCH_SIZE = 10;

export function inBatches<T>(items: readonly T[], size = CONTENT_BATCH_SIZE): T[][] {
  const batches: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    batches.push(items.slice(start, start + size));
  }
  return batches;
}
