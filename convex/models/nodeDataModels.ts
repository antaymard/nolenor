import { ConvexError } from "convex/values";
import type { FunctionReference } from "convex/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { components, internal } from "../_generated/api";
import { hasLiveDoc } from "../blocknoteSync";
import * as SearchableChunkModels from "./searchableChunkModels";
import * as NodeDataVersionModels from "./nodeDataVersionModels";
import * as R2ObjectModels from "./r2ObjectModels";
import { extractR2Keys } from "../lib/r2Keys";
import { readStoredImages, type StoredImage } from "../lib/storedImages";
import type { NodeDataVersionActor } from "../schemas/nodeDataVersionsSchema";
import { buildTemplateValuesSchema } from "../config/fieldConfig";
import {
  parseStoredBlockNoteDocument,
  stringifyBlockNoteDocumentForStorage,
  InvalidBlockNoteDocumentError,
} from "../lib/blockNoteDocument";
import { Debouncer } from "../lib/debouncer";

// Une table éditée cellule par cellule écrit à chaque frappe validée : on
// réindexe une fois que ça se calme (au plus tard toutes les 30 s pendant une
// édition continue), pas à chaque écriture.
const DEBOUNCED_REINDEX_KEYS = ["table", "title"];
// Type explicite : l'inférer passerait par `internal`, qui dépend de ce
// fichier.
const reindexDebouncer: Debouncer<
  FunctionReference<
    "action",
    "internal",
    { nodeDataId: Id<"nodeDatas">; updatedKeys?: string[] },
    null
  >
> = new Debouncer(
  components.debouncer,
  internal.searchable.chunkBuilder.rebuildChunks,
  { delay: 5_000, maxWait: 30_000 },
);

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

  // Track the R2 references
  await R2ObjectModels.syncRefs(ctx, {
    nodeDataId,
    keys: extractR2Keys({ type, values }, template),
  });

  // Launch chunk rebuild for the nodeData
  await ctx.scheduler.runAfter(
    0,
    internal.searchable.chunkBuilder.rebuildChunksBatch,
    {
      nodeDataIds: [nodeDataId],
    },
  );

  return nodeDataId;
}

export async function deleteNodeDataWithCascade(
  ctx: MutationCtx,
  {
    nodeDataId,
    actor = { type: "system" },
    purgeVersions = false,
  }: {
    nodeDataId: Id<"nodeDatas">;
    actor?: NodeDataVersionActor;
    // Emporte aussi l'historique du node, au lieu de le laisser vivre sa
    // rétention. Réservé à la suppression de compte : un compte effacé ne
    // laisse pas trente jours de snapshots de son contenu derrière lui.
    purgeVersions?: boolean;
  },
): Promise<void> {
  const nodeData = await ctx.db.get(nodeDataId);

  // Idempotent : sans ce retour, le `ctx.db.delete` final jetterait sur une
  // ligne déjà supprimée. Inatteignable tant que la cascade partait en
  // `runAfter(0)` depuis le trash (un seul appel possible) ; la corbeille l'a
  // rendu atteignable — le cron de purge peut retomber sur un nodeData déjà
  // détruit par l'ancienne cascade immédiate, ou rejouer un lot.
  if (!nodeData) return;

  // Only keys this node held the last reference to. A duplicate still pointing
  // at the same file keeps it alive.
  const r2Keys = await R2ObjectModels.releaseRefs(ctx, { nodeDataId });

  if (purgeVersions) {
    // L'inverse exact du cas normal : pas de snapshot final — il recréerait
    // le contenu qu'on est en train de détruire — et l'historique déjà
    // accumulé part avec. En lots re-schedulés : un node édité pendant des
    // semaines peut porter des centaines de versions, chacune pesant tout son
    // `values`, ce qui ne tient pas dans cette transaction.
    await ctx.scheduler.runAfter(
      0,
      internal.nodeDataVersions.purgeForNodeData,
      { nodeDataId },
    );
  } else {
    // Snapshot final : les versions survivent volontairement au node
    // (purgées par leur propre TTL) pour permettre une récupération après une
    // suppression accidentelle. Depuis la corbeille, ce snapshot est pris au
    // moment de la purge et non du trash — le contenu n'est détruit qu'ici.
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

  // Le doc collaboratif d'un blocknote (no-op s'il n'a jamais été ouvert en
  // sync : le composant ne trouve rien à supprimer).
  if (nodeData.type === "blocknote") {
    await ctx.runMutation(components.prosemirrorSync.lib.deleteDocument, {
      id: nodeDataId,
    });
  }

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
    // Le `doc` vient du doc collaboratif (cf. blocknoteSync.ts) : il n'y a
    // rien à y renvoyer. Toute autre écriture du `doc` d'un blocknote
    // (agent, restore, MCP, ancienne window) y est poussée.
    fromSync = false,
    // Éditeurs humains qui travaillent ensemble sur le même node (doc
    // collaboratif, table éditée par opérations) : leurs écritures alternées
    // tombent dans le même point de restauration (cf. maybeCheckpoint).
    sharedHumanSession = fromSync,
    // Écritures fines et rapprochées (une cellule à la fois) : la
    // réindexation attend que ça se calme au lieu de repartir à chaque fois.
    debounceReindex = false,
  }: {
    _id: Id<"nodeDatas">;
    values: Record<string, unknown>;
    actor: NodeDataVersionActor;
    skipValidation?: boolean;
    fromSync?: boolean;
    sharedHumanSession?: boolean;
    debounceReindex?: boolean;
  },
): Promise<boolean> {
  console.log(`🔄 Updating values for nodeData ${_id}`);
  let existing = await ctx.db.get("nodeDatas", _id);
  if (!existing) throw new ConvexError("NodeData not found");

  // Blocknote ouvert en édition collaborative, `doc` écrit hors sync : la
  // recopie des dernières frappes, si elle attend encore son échéance, est
  // faite d'abord. Le point de restauration ci-dessous contient alors ce qui
  // vient d'être tapé, attribué à son auteur (cf. blocknoteLiveDoc.catchUp).
  const isBlocknoteDocWrite =
    existing.type === "blocknote" && "doc" in values && !fromSync;
  const hasLiveBlocknoteDoc =
    isBlocknoteDocWrite && (await hasLiveDoc(ctx, _id));
  if (hasLiveBlocknoteDoc) {
    await ctx.runMutation(internal.blocknoteLiveDoc.catchUp, {
      nodeDataId: _id,
    });
    existing = await ctx.db.get("nodeDatas", _id);
    if (!existing) throw new ConvexError("NodeData not found");
  }

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
    sharedHumanSession,
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

  if (debounceReindex) {
    // Les arguments du dernier appel gagnent : toutes les clés que ce chemin
    // peut écrire, pour qu'aucune ne soit oubliée par le regroupement.
    await reindexDebouncer.schedule(ctx, _id, {
      nodeDataId: _id,
      updatedKeys: DEBOUNCED_REINDEX_KEYS,
    });
  } else {
    await ctx.scheduler.runAfter(
      0,
      internal.searchable.chunkBuilder.rebuildChunks,
      {
        nodeDataId: _id,
        updatedKeys: changedKeys,
      },
    );
  }

  // Un blocknote ouvert en édition collaborative a un doc ProseMirror vivant
  // dans le composant prosemirror-sync : sans cette poussée, l'écriture
  // serait écrasée par la prochaine recopie depuis les éditeurs ouverts. Dans
  // la même transaction, pour qu'aucune recopie ne puisse passer entre les
  // deux. Rien à faire tant que personne ne l'a ouvert en sync (il naît de
  // `values.doc`).
  if (hasLiveBlocknoteDoc && "doc" in changedValues) {
    await ctx.runMutation(internal.blocknoteLiveDoc.pushStoredDoc, {
      nodeDataId: _id,
    });
  }

  return true;
}

// Le type vit dans `lib/storedImages.ts`, avec le lecteur qui va avec ; il est
// re-exporté ici parce que c'est d'ici que tous les call-sites l'importaient.
export type { StoredImage };

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

  const current = readStoredImages(existing.values);

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

/**
 * Statut de transcription d'un node audio, même contrat que
 * `setImageGeneration` : patch direct hors `values`, `updatedAt` bumpé pour
 * que le `nodeDataStore` client voie le changement.
 */
export async function setTranscription(
  ctx: MutationCtx,
  {
    nodeDataId,
    status,
    sourceKey,
    error,
  }: {
    nodeDataId: Id<"nodeDatas">;
    status: "running" | "error";
    sourceKey: string;
    error?: string;
  },
): Promise<void> {
  const now = Date.now();
  await ctx.db.patch("nodeDatas", nodeDataId, {
    transcription: { status, sourceKey, startedAt: now, error },
    updatedAt: now,
  });
}

/**
 * Avancement d'une transcription longue. Ne touche qu'un statut `running`
 * du même fichier : un run dépassé (fichier remplacé, relance) n'écrase pas
 * le statut du suivant.
 */
export async function setTranscriptionProgress(
  ctx: MutationCtx,
  {
    nodeDataId,
    sourceKey,
    done,
    total,
  }: {
    nodeDataId: Id<"nodeDatas">;
    sourceKey: string;
    done: number;
    total: number;
  },
): Promise<void> {
  const nodeData = await ctx.db.get("nodeDatas", nodeDataId);
  const current = nodeData?.transcription;
  if (!current || current.status !== "running") return;
  if (current.sourceKey !== sourceKey) return;
  await ctx.db.patch("nodeDatas", nodeDataId, {
    transcription: { ...current, progress: { done, total } },
    updatedAt: Date.now(),
  });
}

/** Le succès se lit dans les chunks `transcript` : on efface le statut. */
export async function clearTranscription(
  ctx: MutationCtx,
  { nodeDataId }: { nodeDataId: Id<"nodeDatas"> },
): Promise<void> {
  await ctx.db.patch("nodeDatas", nodeDataId, {
    transcription: undefined,
    updatedAt: Date.now(),
  });
}
