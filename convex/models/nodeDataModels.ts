import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import * as SearchableChunkModels from "./searchableChunkModels";
import * as NodeDataVersionModels from "./nodeDataVersionModels";
import type { NodeDataVersionActor } from "../schemas/nodeDataVersionsSchema";
import {
  parseStoredBlockNoteDocument,
  stringifyBlockNoteDocumentForStorage,
  InvalidBlockNoteDocumentError,
} from "../lib/blockNoteDocument";

export async function readNodeData(
  ctx: QueryCtx,
  { _id }: { _id: Id<"nodeDatas"> },
): Promise<Doc<"nodeDatas">> {
  const nodeData = await ctx.db.get("nodeDatas", _id);
  if (!nodeData) throw new ConvexError("NodeData not found");
  return nodeData;
}

export async function createNodeData(
  ctx: MutationCtx,
  {
    type,
    values,
    canvasId,
  }: {
    type: Doc<"nodeDatas">["type"];
    values: Record<string, unknown>;
    canvasId: Id<"canvases">;
  },
): Promise<Id<"nodeDatas">> {
  return ctx.db.insert("nodeDatas", {
    type,
    values,
    canvasId,
    updatedAt: Date.now(),
  });
}

export async function deleteNodeDataWithCascade(
  ctx: MutationCtx,
  {
    nodeDataId,
    actor = { type: "system" },
  }: {
    nodeDataId: Id<"nodeDatas">;
    actor?: NodeDataVersionActor;
  },
): Promise<void> {
  const nodeData = await ctx.db.get(nodeDataId);
  const r2Keys: string[] = [];

  if (nodeData) {
    // Snapshot final : les versions survivent volontairement au node
    // (corbeille de fait, purgée par TTL) pour permettre une récupération
    // après une suppression accidentelle.
    await NodeDataVersionModels.maybeCheckpoint(ctx, {
      nodeData,
      actor,
      changedKeys: [],
      trigger: "delete",
      force: true,
    });

    if (nodeData.type === "pdf") {
      const files = nodeData.values?.files;
      if (Array.isArray(files)) {
        for (const file of files) {
          if (
            file &&
            typeof file === "object" &&
            typeof (file as Record<string, unknown>).key === "string"
          ) {
            r2Keys.push((file as Record<string, unknown>).key as string);
          }
        }
      }
    } else if (nodeData.type === "image") {
      const publicUrlBase = process.env.R2_PUBLIC_URL;
      const images = nodeData.values?.images;
      if (Array.isArray(images)) {
        for (const image of images) {
          if (image && typeof image === "object") {
            const imgRecord = image as Record<string, unknown>;
            if (typeof imgRecord.key === "string") {
              r2Keys.push(imgRecord.key);
            } else if (publicUrlBase && typeof imgRecord.url === "string") {
              const url = imgRecord.url;
              const prefix = `${publicUrlBase}/`;
              if (url.startsWith(prefix)) {
                r2Keys.push(url.slice(prefix.length));
              }
            }
          }
        }
      }
    }
  }

  // Delete memories
  const memories = await ctx.db
    .query("memories")
    .withIndex("by_subject_and_type", (q) => q.eq("subjectId", nodeDataId))
    .collect();
  for (const memory of memories) {
    await ctx.db.delete(memory._id);
  }

  // Delete searchable chunks
  await SearchableChunkModels.deleteByNodeDataId(ctx, { nodeDataId });

  // Delete the nodeData itself
  await ctx.db.delete(nodeDataId);

  if (r2Keys.length > 0) {
    await ctx.scheduler.runAfter(0, internal.uploads.deleteR2Files, {
      keys: r2Keys,
    });
  }
}

export async function updateValues(
  ctx: MutationCtx,
  {
    _id,
    values,
    actor,
  }: {
    _id: Id<"nodeDatas">;
    values: Record<string, unknown>;
    actor: NodeDataVersionActor;
  },
): Promise<boolean> {
  console.log(`🔄 Updating values for nodeData ${_id}`);
  const existing = await ctx.db.get("nodeDatas", _id);
  if (!existing) throw new ConvexError("NodeData not found");

  // Diff minimal: on ne conserve que les clés réellement modifiées.
  // Cela évite un patch DB + une reindexation quand la valeur entrante est identique.
  const changedEntries = Object.entries(values).filter(
    ([key, nextValue]) => !Object.is(existing.values?.[key], nextValue),
  );

  // No-op explicite: on sort tôt pour limiter invalidations réactives et coût scheduler.
  if (changedEntries.length === 0) {
    return true;
  }

  // On patch uniquement le delta pour garder une écriture ciblée.
  const changedValues = Object.fromEntries(changedEntries);

  // AppNode: quand le code change, on bump __v et on reset les erreurs runtime.
  // Cela invalide les erreurs venant d'une iframe exécutant l'ancienne version
  // (cf. reportAppErrors qui rejette les writes dont __v ne matche pas).
  if (existing.type === "app" && "code" in changedValues) {
    changedValues.__v = `${Date.now()}`;
    changedValues.errors = [];
  }

  // Blocknote: on canonicalise et on valide le `doc` côté serveur pour qu'une
  // écriture frontend (JSON.stringify brut) ne puisse pas persister un document
  // que les tools IA refuseraient ensuite (tables valides, ids uniques, etc.).
  // Un document invalide est rejeté, pas silencieusement transformé en [].
  if (existing.type === "blocknote" && "doc" in changedValues) {
    const parsed = parseStoredBlockNoteDocument(changedValues.doc);
    if (!parsed) {
      throw new ConvexError(
        "Invalid blocknote document: could not parse stored value.",
      );
    }
    try {
      changedValues.doc = stringifyBlockNoteDocumentForStorage(parsed);
    } catch (error) {
      const message =
        error instanceof InvalidBlockNoteDocumentError
          ? error.message
          : "Invalid blocknote document.";
      throw new ConvexError(message);
    }
  }

  // On passe aussi les clés modifiées au rebuild pour que l'action puisse skipper
  // les branches coûteuses quand les champs pertinents n'ont pas changé.
  const changedKeys = Object.keys(changedValues);

  // Checkpoint invisible : snapshot PRÉ-write coalescé par session d'acteur
  // (cf. nodeDataVersionModels). Doit précéder le patch pour capturer l'état
  // restaurable.
  await NodeDataVersionModels.maybeCheckpoint(ctx, {
    nodeData: existing,
    actor,
    changedKeys,
    trigger: "update",
  });

  const now = Date.now();
  await ctx.db.patch("nodeDatas", _id, {
    values: { ...existing.values, ...changedValues },
    updatedAt: now,
  });

  await ctx.scheduler.runAfter(
    0,
    internal.searchable.chunkBuilder.rebuildChunks,
    {
      nodeDataId: _id,
      updatedKeys: changedKeys,
    },
  );

  return true;
}
