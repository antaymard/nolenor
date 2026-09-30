import type { ActionCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import type { NodeDataVersionActor } from "../../schemas/nodeDataVersionsSchema";
import { internal } from "../../_generated/api";
import { toolError } from "../tools/toolHelpers";

// Nombre de passes lecture → transformation → écriture avant d'abandonner.
// Les conflits viennent d'appels parallèles d'un même agent : quelques
// tentatives suffisent à les sérialiser.
const MAX_TABLE_WRITE_ATTEMPTS = 5;

export class TableWriteConflictError extends Error {
  constructor() {
    super("Table was modified concurrently.");
    this.name = "TableWriteConflictError";
  }
}

/**
 * Réécrit la table seulement si elle n'a pas changé depuis sa lecture
 * (`expectedTable`). Lève `TableWriteConflictError` sinon, à rattraper par
 * `withTableWriteRetry` pour rejouer le tool sur l'état frais.
 */
export async function writeTableIfUnchanged(
  ctx: Pick<ActionCtx, "runMutation">,
  args: {
    nodeDataId: Id<"nodeDatas">;
    expectedTable: unknown;
    table: unknown;
    actor: NodeDataVersionActor;
  },
): Promise<void> {
  const written = await ctx.runMutation(
    internal.wrappers.nodeDataWrappers.updateTableIfUnchanged,
    {
      _id: args.nodeDataId,
      expectedTable: args.expectedTable,
      table: args.table,
      actor: args.actor,
    },
  );
  if (!written) throw new TableWriteConflictError();
}

export async function withTableWriteRetry(
  attempt: () => Promise<string>,
): Promise<string> {
  for (let i = 1; i <= MAX_TABLE_WRITE_ATTEMPTS; i++) {
    try {
      return await attempt();
    } catch (error) {
      if (!(error instanceof TableWriteConflictError)) throw error;
      console.warn(
        `⚠️ Table write conflict (attempt ${i}/${MAX_TABLE_WRITE_ATTEMPTS}), retrying on fresh state`,
      );
    }
  }
  return toolError(
    "The table kept being modified by other operations while this one ran. Re-read the table and retry.",
  );
}
