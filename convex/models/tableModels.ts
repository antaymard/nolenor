import { ConvexError } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { NodeDataVersionActor } from "../schemas/nodeDataVersionsSchema";
import type { TableOp } from "../schemas/tableOpsSchema";
import { applyTableOps, readStoredTable } from "../lib/tableOps";
import * as NodeDataModels from "./nodeDataModels";

/**
 * Applique des opérations à un node table, dans la transaction de l'appelant.
 *
 * Lecture et écriture dans la même transaction : Convex sérialise deux
 * appels concurrents, le second rejoue sur l'état laissé par le premier. Plus
 * de table relue côté client ou côté action puis réécrite en entier — donc
 * plus d'écrasement ni de boucle de comparaison-réessai.
 *
 * Renvoie `false` si les opérations n'ont rien changé (cible disparue,
 * valeur identique).
 */
export async function applyOps(
  ctx: MutationCtx,
  {
    nodeData,
    ops,
    actor,
  }: {
    nodeData: Doc<"nodeDatas">;
    ops: ReadonlyArray<TableOp>;
    actor: NodeDataVersionActor;
  },
): Promise<boolean> {
  if (nodeData.type !== "table") {
    throw new ConvexError("Target node must be a table.");
  }

  const previous = {
    table: readStoredTable(nodeData.values?.table),
    title:
      typeof nodeData.values?.title === "string" ? nodeData.values.title : "",
  };
  const next = applyTableOps(previous, ops);

  const values: Record<string, unknown> = {};
  if (JSON.stringify(next.table) !== JSON.stringify(previous.table)) {
    values.table = next.table;
  }
  if (next.title !== previous.title) values.title = next.title;
  if (Object.keys(values).length === 0) return false;

  await NodeDataModels.updateValues(ctx, {
    _id: nodeData._id,
    values,
    actor,
    // Comme le doc collaboratif d'un blocknote : des humains qui éditent la
    // même table ensemble partagent un point de restauration, au lieu d'en
    // créer un à chaque alternance.
    sharedHumanSession: actor.type === "user",
    debounceReindex: true,
  });
  return true;
}
