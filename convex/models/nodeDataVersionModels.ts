import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type {
  NodeDataVersionActor,
  NodeDataVersionTrigger,
} from "../schemas/nodeDataVersionsSchema";

// Un même acteur qui édite en continu ne produit au plus qu'un checkpoint par
// fenêtre : les versions matérialisent des sessions d'édition, pas des writes.
export const COALESCE_WINDOW_MS = 3 * 60 * 1000; // 3 min

// App nodes uniquement :
// - NOISE_KEYS : clés opérationnelles (bump de version d'iframe, erreurs
//   runtime) qui ne constituent jamais un contenu à restaurer seules.
// - SESSION_ONLY_KEYS : le `state` est sauvegardé en continu par les apps
//   (nolenor:saveState) ; son churn ne rouvre pas une session du même acteur,
//   mais un changement d'acteur force toujours un checkpoint.
const APP_NOISE_KEYS = new Set(["__v", "errors"]);
const APP_SESSION_ONLY_KEYS = new Set(["state"]); // "state" used to be here

export const VERSION_RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 jours
export const PRUNE_BATCH_SIZE = 200;

export function actorsEqual(
  a: NodeDataVersionActor,
  b: NodeDataVersionActor,
): boolean {
  if (a.type === "system" || b.type === "system") return a.type === b.type;
  if (a.type !== b.type) return false;
  if (a.userId !== b.userId) return false;
  const aThreadId = a.type === "agent" ? a.threadId : undefined;
  const bThreadId = b.type === "agent" ? b.threadId : undefined;
  // Deux threads agents distincts = deux sessions distinctes.
  return aThreadId === bThreadId;
}

// Insère un checkpoint contenant les values PRÉ-write de `nodeData`, sauf si
// le write entrant prolonge la session d'édition courante. À appeler AVANT le
// patch (même transaction : le log ne peut pas dériver de la réalité).
export async function maybeCheckpoint(
  ctx: MutationCtx,
  {
    nodeData,
    actor,
    changedKeys,
    trigger,
    force = false,
  }: {
    nodeData: Doc<"nodeDatas">;
    actor: NodeDataVersionActor;
    changedKeys: Array<string>;
    trigger: NodeDataVersionTrigger;
    force?: boolean;
  },
): Promise<Id<"nodeDataVersions"> | null> {
  const isApp = nodeData.type === "app";

  if (!force) {
    const contentKeys = isApp
      ? changedKeys.filter((key) => !APP_NOISE_KEYS.has(key))
      : changedKeys;
    if (contentKeys.length === 0) return null;

    const latest = await ctx.db
      .query("nodeDataVersions")
      .withIndex("by_nodeDataId", (q) => q.eq("nodeDataId", nodeData._id))
      .order("desc")
      .first();

    if (latest && actorsEqual(latest.actor, actor)) {
      if (Date.now() - latest._creationTime < COALESCE_WINDOW_MS) return null;
      if (isApp && contentKeys.every((key) => APP_SESSION_ONLY_KEYS.has(key)))
        return null;
    }
  }

  return ctx.db.insert("nodeDataVersions", {
    nodeDataId: nodeData._id,
    canvasId: nodeData.canvasId,
    nodeType: nodeData.type,
    values: nodeData.values,
    actor,
    changedKeys,
    trigger,
  });
}

// Métadonnées seules (sans `values`) : l'historique d'un node se liste sans
// rapatrier des snapshots potentiellement volumineux.
export async function listByNodeDataId(
  ctx: QueryCtx,
  { nodeDataId }: { nodeDataId: Id<"nodeDatas"> },
) {
  const versions = await ctx.db
    .query("nodeDataVersions")
    .withIndex("by_nodeDataId", (q) => q.eq("nodeDataId", nodeDataId))
    .order("desc")
    .collect();

  return versions.map((version) => ({
    _id: version._id,
    _creationTime: version._creationTime,
    nodeDataId: version.nodeDataId,
    canvasId: version.canvasId,
    nodeType: version.nodeType,
    actor: version.actor,
    changedKeys: version.changedKeys,
    trigger: version.trigger,
  }));
}

// Supprime un lot de versions au-delà de la rétention. Renvoie true si le lot
// était plein (il en reste probablement : l'appelant doit se re-scheduler).
export async function pruneExpiredBatch(ctx: MutationCtx): Promise<boolean> {
  const cutoff = Date.now() - VERSION_RETENTION_MS;
  const expired = await ctx.db
    .query("nodeDataVersions")
    .withIndex("by_creation_time", (q) => q.lt("_creationTime", cutoff))
    .take(PRUNE_BATCH_SIZE);

  for (const version of expired) {
    await ctx.db.delete(version._id);
  }

  return expired.length === PRUNE_BATCH_SIZE;
}
