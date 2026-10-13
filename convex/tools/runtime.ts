import type { ActionCtx } from "../_generated/server";

/**
 * Ce dont un noyau a besoin : enchaîner des transactions depuis l'action qui
 * exécute le tool (Nolë, MCP, le shell). `runAction` pour ce qui n'existe
 * qu'en action (la recherche vectorielle). Pas d'`ActionCtx` entier : un
 * noyau ne planifie rien.
 */
export type ToolRunCtx = Pick<ActionCtx, "runQuery" | "runMutation" | "runAction">;

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

/**
 * Combien de transactions un noyau lance à la fois. Sans borne, un `nole ls`
 * sur 2 000 nodes partait en 200 requêtes simultanées.
 */
export const MAX_CONCURRENT_READS = 8;

/** `Promise.all(items.map(fn))`, au plus `limit` à la fois, ordre préservé. */
export async function mapConcurrently<T, R>(
  items: readonly T[],
  fn: (item: T) => Promise<R>,
  limit = MAX_CONCURRENT_READS,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return results;
}
