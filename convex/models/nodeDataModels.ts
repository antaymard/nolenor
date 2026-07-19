import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import * as SearchableChunkModels from "./searchableChunkModels";
import * as NodeDataVersionModels from "./nodeDataVersionModels";
import type { NodeDataVersionActor } from "../schemas/nodeDataVersionsSchema";
import { collectR2KeysForTemplateValues } from "../config/fieldConfig";

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
    templateId,
  }: {
    type: Doc<"nodeDatas">["type"];
    values: Record<string, unknown>;
    canvasId: Id<"canvases">;
    templateId?: Id<"nodeTemplates">;
  },
): Promise<Id<"nodeDatas">> {
  return ctx.db.insert("nodeDatas", {
    type,
    values,
    canvasId,
    ...(templateId && { templateId }),
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
    } else if (nodeData.type === "custom") {
      // Champs image des custom nodes : clés collectées via le template ;
      // fallback défensif (template supprimé) : scan des values pour des
      // objets porteurs d'une `key` string.
      const template = nodeData.templateId
        ? await ctx.db.get(nodeData.templateId)
        : null;
      if (template) {
        r2Keys.push(
          ...collectR2KeysForTemplateValues(template, nodeData.values ?? {}),
        );
      } else {
        for (const value of Object.values(nodeData.values ?? {})) {
          if (
            value &&
            typeof value === "object" &&
            typeof (value as Record<string, unknown>).key === "string"
          ) {
            r2Keys.push((value as Record<string, unknown>).key as string);
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
