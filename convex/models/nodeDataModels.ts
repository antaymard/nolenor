import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import * as SearchableChunkModels from "./searchableChunkModels";
import * as NodeDataVersionModels from "./nodeDataVersionModels";
import * as R2ObjectModels from "./r2ObjectModels";
import { extractR2Keys } from "../lib/r2Keys";
import type { NodeDataVersionActor } from "../schemas/nodeDataVersionsSchema";
import { buildTemplateValuesSchema } from "../config/fieldConfig";
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
    templateId,
  }: {
    type: Doc<"nodeDatas">["type"];
    values: Record<string, unknown>;
    canvasId: Id<"canvases">;
    templateId?: Id<"nodeTemplates">;
  },
): Promise<Id<"nodeDatas">> {
  // `templateId` est optionnel au schéma parce que les types prébuilts n'en
  // ont pas — mais pour un custom il est obligatoire, et le typage ne peut pas
  // l'exprimer ici. Sans lui, le node se rend quand même sur le canvas (qui
  // lit la copie dénormalisée du canvas node) : la panne se manifeste ailleurs,
  // à l'ouverture de la window et surtout dans la validation des values à
  // l'écriture, qui cesse de s'exécuter. C'est ce silence qu'on ferme.
  //
  // Posé ici et non dans la mutation publique : c'est le point de passage
  // UNIQUE des deux voies (mutation publique et wrapper interne de l'agent),
  // et les arguments de la première viennent du réseau, où le typage ne
  // protège de rien.
  if (type === "custom" && !templateId) {
    throw new ConvexError(
      "A custom node requires a templateId (the template defines its fields and layouts).",
    );
  }

  const nodeDataId = await ctx.db.insert("nodeDatas", {
    type,
    values,
    canvasId,
    ...(templateId && { templateId }),
    updatedAt: Date.now(),
  });

  // Duplication copies `values` wholesale, so a fresh node can already point
  // at an existing blob. Register the references before anyone can delete it.
  //
  // Les champs porteurs de fichiers d'un custom node sont décrits par son
  // template : sans lui, il n'y a rien à référencer.
  const template = templateId ? await ctx.db.get(templateId) : null;
  await R2ObjectModels.syncRefs(ctx, {
    nodeDataId,
    keys: extractR2Keys({ type, values }, template),
  });

  return nodeDataId;
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

  // Only keys this node held the last reference to. A duplicate still pointing
  // at the same file keeps it alive.
  const r2Keys = await R2ObjectModels.releaseRefs(ctx, { nodeDataId });

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
    // Réservé au restore de version (nodeDataVersions.ts) : un ancien
    // snapshot ne doit jamais devenir irrestaurable parce que le template a
    // évolué depuis (option supprimée, contrainte resserrée). Jamais exposé
    // dans un validateur d'arguments public — seul du code serveur peut le
    // positionner.
    skipValidation = false,
  }: {
    _id: Id<"nodeDatas">;
    values: Record<string, unknown>;
    actor: NodeDataVersionActor;
    skipValidation?: boolean;
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

  // Résolu une seule fois : le template sert à valider le delta ET à lire les
  // clés R2 du node plus bas — cette dernière lecture doit avoir lieu même
  // quand la validation est sautée (restore de version), sinon la
  // réconciliation croirait le node vide de fichiers et libérerait ses
  // références.
  const template =
    existing.type === "custom" && existing.templateId
      ? await ctx.db.get(existing.templateId)
      : null;

  // Custom : valide le DELTA (changedValues), jamais les `values` entrantes
  // complètes — une value ancienne, non touchée par CE write, ne doit jamais
  // faire échouer l'écriture d'un AUTRE champ du même node (ex. option de
  // select supprimée dans le builder, min/max resserré après coup : le node
  // ne doit jamais devenir injoignable). Silencieux si le template n'est
  // plus résoluble (course, template supprimé) : on ne bloque pas une
  // écriture qu'on ne peut de toute façon pas valider.
  if (!skipValidation && template) {
    const parsed = buildTemplateValuesSchema(template).safeParse(changedValues);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
        .join("; ");
      throw new ConvexError(`Invalid value(s) for custom node: ${issues}`);
    }

    // Champs rich_text : même contrat que le node blocknote prébuilt
    // ci-dessus — canonicaliser et valider la structure côté serveur, et
    // REJETER un document invalide plutôt que de le transformer
    // silencieusement, sinon un write frontend pourrait persister un
    // document que les tools blocs de l'agent refuseraient ensuite.
    for (const field of template.fields) {
      if (field.type !== "rich_text") continue;
      const raw = changedValues[field.id];
      // null = champ effacé (contrat nullable), rien à canonicaliser.
      if (raw === undefined || raw === null) continue;

      const doc = parseStoredBlockNoteDocument(raw);
      if (!doc) {
        throw new ConvexError(
          `Invalid rich text for field "${field.name}": could not parse stored value.`,
        );
      }
      try {
        changedValues[field.id] = stringifyBlockNoteDocumentForStorage(doc);
      } catch (error) {
        const message =
          error instanceof InvalidBlockNoteDocumentError
            ? error.message
            : "Invalid rich text document.";
        throw new ConvexError(
          `Invalid rich text for field "${field.name}": ${message}`,
        );
      }
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
  const nextValues = { ...existing.values, ...changedValues };
  await ctx.db.patch("nodeDatas", _id, {
    values: nextValues,
    updatedAt: now,
  });

  // Swapping a node's file is an ordinary update, so this is also what stops
  // the replaced blob from lingering on R2 forever.
  const orphanedKeys = await R2ObjectModels.syncRefs(ctx, {
    nodeDataId: _id,
    keys: extractR2Keys({ type: existing.type, values: nextValues }, template),
  });
  if (orphanedKeys.length > 0) {
    await ctx.scheduler.runAfter(0, internal.uploads.deleteR2Files, {
      keys: orphanedKeys,
    });
  }

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

/** Une image telle que stockée dans `values.images` d'un node "image". */
export type StoredImage = {
  url: string;
  filename?: string;
  mimeType?: string;
  size?: number;
  uploadedAt?: number;
  key?: string;
};

/**
 * Ajoute des images à la fin de `values.images`, et éteint le statut de
 * génération dans la même transaction.
 *
 * Le read-modify-write DOIT vivre ici, pas côté action : le client écrit
 * `images` en remplaçant tout le tableau (cf. ImageNode), donc lire depuis
 * l'action puis réécrire écraserait silencieusement un upload concurrent.
 * Dans la transaction, Convex sérialise les writes en conflit.
 *
 * Note sur les références R2 : un append ne fait que grossir l'ensemble des
 * clés, donc `syncRefs` (appelé par `updateValues`) n'en libère aucune et rien
 * n'est supprimé. En revanche, restaurer une version antérieure à la
 * génération repassera par `updateValues` avec un tableau plus court, et les
 * blobs générés seront alors supprimés — les versions ne portent pas de
 * référence R2. Comportement pré-existant, commun à tous les types de node
 * porteurs de fichiers.
 */
export async function appendImages(
  ctx: MutationCtx,
  {
    nodeDataId,
    images,
    actor,
  }: {
    nodeDataId: Id<"nodeDatas">;
    images: StoredImage[];
    actor: NodeDataVersionActor;
  },
): Promise<void> {
  const existing = await ctx.db.get("nodeDatas", nodeDataId);
  if (!existing) throw new ConvexError("NodeData not found");

  const current = Array.isArray(existing.values?.images)
    ? (existing.values.images as StoredImage[])
    : [];

  if (images.length > 0) {
    await updateValues(ctx, {
      _id: nodeDataId,
      values: { images: [...current, ...images] },
      actor,
    });
  }

  await clearImageGeneration(ctx, { nodeDataId });
}

/**
 * Écrit le statut de génération, hors `values` : un `ctx.db.patch` direct ne
 * déclenche ni checkpoint de version, ni réconciliation R2, ni réindexation.
 *
 * `updatedAt` est obligatoire ici : le store client (nodeDataStore) n'accepte
 * un document entrant que si son `updatedAt` diffère. Sans ce bump, la query
 * se réinvalide mais l'UI ne voit jamais le changement de statut.
 */
export async function setImageGeneration(
  ctx: MutationCtx,
  {
    nodeDataId,
    status,
    error,
  }: {
    nodeDataId: Id<"nodeDatas">;
    status: "running" | "error";
    error?: string;
  },
): Promise<void> {
  const now = Date.now();
  await ctx.db.patch("nodeDatas", nodeDataId, {
    imageGeneration: { status, startedAt: now, error },
    updatedAt: now,
  });
}

/** Le succès n'est pas un état : on efface plutôt que de marquer "terminé". */
export async function clearImageGeneration(
  ctx: MutationCtx,
  { nodeDataId }: { nodeDataId: Id<"nodeDatas"> },
): Promise<void> {
  await ctx.db.patch("nodeDatas", nodeDataId, {
    imageGeneration: undefined,
    updatedAt: Date.now(),
  });
}
