import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

/**
 * Reconciles the R2 references held by one nodeData, and reports which keys
 * that leaves unreferenced so the caller can bin the blobs.
 *
 * Deletion is driven by rows we actually owned, never by the values alone.
 * A nodeData created before this table existed has no rows, so it releases
 * nothing and its blob is merely leaked — the safe direction. The destructive
 * direction, deleting a file a duplicate is still using, is unreachable.
 */
export async function syncRefs(
  ctx: MutationCtx,
  {
    nodeDataId,
    keys,
  }: {
    nodeDataId: Id<"nodeDatas">;
    keys: string[];
  },
): Promise<string[]> {
  const existing = await ctx.db
    .query("r2Objects")
    .withIndex("by_nodeDataId", (q) => q.eq("nodeDataId", nodeDataId))
    .collect();

  const nextKeys = new Set(keys);
  const heldKeys = new Set(existing.map((row) => row.key));

  for (const key of nextKeys) {
    if (!heldKeys.has(key)) {
      await ctx.db.insert("r2Objects", { key, nodeDataId });
    }
  }

  const released = new Set<string>();
  for (const row of existing) {
    if (nextKeys.has(row.key)) continue;
    await ctx.db.delete(row._id);
    released.add(row.key);
  }

  const orphaned: string[] = [];
  for (const key of released) {
    const remaining = await ctx.db
      .query("r2Objects")
      .withIndex("by_key", (q) => q.eq("key", key))
      .first();
    if (!remaining) orphaned.push(key);
  }

  return orphaned;
}

/** Drops every reference held by a nodeData, e.g. when it is deleted. */
export async function releaseRefs(
  ctx: MutationCtx,
  { nodeDataId }: { nodeDataId: Id<"nodeDatas"> },
): Promise<string[]> {
  return syncRefs(ctx, { nodeDataId, keys: [] });
}

/**
 * Enregistre les références manquantes, sans jamais en retirer.
 *
 * Réservé au backfill des nodeDatas antérieurs à cette table : ils ne
 * détiennent aucune ligne, donc leur suppression ne libère rien et leur
 * fichier reste sur R2. `syncRefs` ferait aussi l'affaire, mais il rend des
 * clés à supprimer — une décision qui n'appartient pas à une migration.
 *
 * Renvoie le nombre de lignes créées.
 */
export async function adoptRefs(
  ctx: MutationCtx,
  {
    nodeDataId,
    keys,
  }: {
    nodeDataId: Id<"nodeDatas">;
    keys: string[];
  },
): Promise<number> {
  const existing = await ctx.db
    .query("r2Objects")
    .withIndex("by_nodeDataId", (q) => q.eq("nodeDataId", nodeDataId))
    .collect();

  const heldKeys = new Set(existing.map((row) => row.key));

  let inserted = 0;
  for (const key of new Set(keys)) {
    if (heldKeys.has(key)) continue;
    await ctx.db.insert("r2Objects", { key, nodeDataId });
    inserted += 1;
  }

  return inserted;
}
