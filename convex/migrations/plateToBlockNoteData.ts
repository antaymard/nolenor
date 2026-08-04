// Accès base de la migration PlateJS -> BlockNote.
//
// Fichier SANS `"use node"` : il n'expose que des queries / mutations, qui ne
// peuvent tourner que dans le runtime Convex par défaut. La conversion
// elle-même (jsdom + Plate) vit dans `plateToBlockNote.ts`, qui est l'action
// Node et le seul appelant de ces fonctions.

import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";

import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { internalAction, internalMutation, internalQuery } from "../_generated/server";
import { parseStoredPlateDocument } from "../lib/plateDocumentStorage";

// ── Recensement ─────────────────────────────────────────────────────────────
//
// À lancer AVANT toute écriture. Le pont Markdown a une perte théorique large
// (couleurs, alignement, callouts, colonnes, toggles…) mais ce qui compte est
// ce que les données contiennent RÉELLEMENT. Cet histogramme est ce qui permet
// de décider si le niveau de perte est acceptable.

type Histogram = Record<string, number>;

type CensusAccumulator = {
  scanned: number;
  documents: number;
  emptyDocuments: number;
  unparsableDocuments: number;
  totalDocBytes: number;
  elementTypes: Histogram;
  elementProps: Histogram;
  leafMarks: Histogram;
};

/** Propriétés structurelles portées par tous les éléments : hors histogramme. */
const IGNORED_ELEMENT_PROPS = new Set(["type", "children", "id"]);

function bump(histogram: Histogram, key: string): void {
  histogram[key] = (histogram[key] ?? 0) + 1;
}

function walkForCensus(node: unknown, acc: CensusAccumulator): void {
  if (node === null || typeof node !== "object" || Array.isArray(node)) return;
  const record = node as Record<string, unknown>;

  if (typeof record.text === "string") {
    for (const key of Object.keys(record)) {
      if (key !== "text" && key !== "id" && key !== "key") bump(acc.leafMarks, key);
    }
    return;
  }

  const type = typeof record.type === "string" ? record.type : "(sans type)";
  bump(acc.elementTypes, type);
  for (const key of Object.keys(record)) {
    if (!IGNORED_ELEMENT_PROPS.has(key)) bump(acc.elementProps, key);
  }

  if (Array.isArray(record.children)) {
    for (const child of record.children) walkForCensus(child, acc);
  }
}

function emptyAccumulator(): CensusAccumulator {
  return {
    scanned: 0,
    documents: 0,
    emptyDocuments: 0,
    unparsableDocuments: 0,
    totalDocBytes: 0,
    elementTypes: {},
    elementProps: {},
    leafMarks: {},
  };
}

function mergeHistograms(into: Histogram, from: Histogram): void {
  for (const [key, value] of Object.entries(from)) {
    into[key] = (into[key] ?? 0) + value;
  }
}

const censusValidator = v.object({
  scanned: v.number(),
  documents: v.number(),
  emptyDocuments: v.number(),
  unparsableDocuments: v.number(),
  totalDocBytes: v.number(),
  elementTypes: v.record(v.string(), v.number()),
  elementProps: v.record(v.string(), v.number()),
  leafMarks: v.record(v.string(), v.number()),
});

export const censusBatch = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({
    census: censusValidator,
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, { paginationOpts }) => {
    const page = await ctx.db
      .query("nodeDatas")
      .filter((q) => q.eq(q.field("type"), "document"))
      .paginate(paginationOpts);

    const census = emptyAccumulator();
    for (const nodeData of page.page) {
      census.scanned += 1;
      census.documents += 1;
      const raw = nodeData.values?.doc;
      if (typeof raw === "string") census.totalDocBytes += raw.length;

      const parsed = parseStoredPlateDocument(raw);
      if (!parsed) {
        census.unparsableDocuments += 1;
        continue;
      }
      if (parsed.length === 0) {
        census.emptyDocuments += 1;
        continue;
      }
      for (const node of parsed) walkForCensus(node, census);
    }

    return {
      census,
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});

/**
 * Recensement complet, en lecture seule. Sortie dans les logs Convex et en
 * valeur de retour (lançable depuis le dashboard).
 */
export const census = internalAction({
  args: { pageSize: v.optional(v.number()) },
  returns: censusValidator,
  handler: async (ctx, { pageSize }) => {
    const total = emptyAccumulator();
    let cursor: string | null = null;

    for (;;) {
      const batch: {
        census: CensusAccumulator;
        isDone: boolean;
        continueCursor: string;
      } = await ctx.runQuery(internal.migrations.plateToBlockNoteData.censusBatch, {
        paginationOpts: { numItems: pageSize ?? 50, cursor },
      });

      total.scanned += batch.census.scanned;
      total.documents += batch.census.documents;
      total.emptyDocuments += batch.census.emptyDocuments;
      total.unparsableDocuments += batch.census.unparsableDocuments;
      total.totalDocBytes += batch.census.totalDocBytes;
      mergeHistograms(total.elementTypes, batch.census.elementTypes);
      mergeHistograms(total.elementProps, batch.census.elementProps);
      mergeHistograms(total.leafMarks, batch.census.leafMarks);

      if (batch.isDone) break;
      cursor = batch.continueCursor;
    }

    console.log(
      `📊 Recensement PlateJS : ${JSON.stringify(total, null, 2)}`,
    );
    return total;
  },
});

// ── Lecture du lot à convertir ──────────────────────────────────────────────

/**
 * Les versions sont chargées AVEC leur node : elles doivent être converties et
 * écrites dans la même transaction, sinon une restauration tombant entre les
 * deux écrit un document Plate sur un node devenu `blocknote` (et
 * `updateValues` le rejette — cf. le garde ajouté dans `nodeDataVersions.ts`).
 */
const MAX_VERSIONS_PER_NODE = 100;

export const loadDocumentBatch = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({
    page: v.array(
      v.object({
        nodeDataId: v.id("nodeDatas"),
        canvasId: v.id("canvases"),
        doc: v.any(),
        versions: v.array(
          v.object({ versionId: v.id("nodeDataVersions"), doc: v.any() }),
        ),
      }),
    ),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, { paginationOpts }) => {
    const result = await ctx.db
      .query("nodeDatas")
      .filter((q) => q.eq(q.field("type"), "document"))
      .paginate(paginationOpts);

    const page = await Promise.all(
      result.page.map(async (nodeData: Doc<"nodeDatas">) => {
        const versionDocs = await ctx.db
          .query("nodeDataVersions")
          .withIndex("by_nodeDataId", (q) => q.eq("nodeDataId", nodeData._id))
          .take(MAX_VERSIONS_PER_NODE);

        return {
          nodeDataId: nodeData._id,
          canvasId: nodeData.canvasId,
          doc: nodeData.values?.doc ?? null,
          versions: versionDocs
            .filter((version) => version.nodeType === "document")
            .map((version) => ({
              versionId: version._id,
              doc: version.values?.doc ?? null,
            })),
        };
      }),
    );

    return {
      page,
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    };
  },
});

// ── Écriture ────────────────────────────────────────────────────────────────

/**
 * Écrit un lot converti.
 *
 * Volontairement en `db.patch` direct, JAMAIS via `NodeDataModels.updateValues` :
 * cette dernière ne sait pas changer le `type`, poserait un checkpoint de
 * version par ligne, et scheduleraient un `rebuildChunks` par ligne — soit N
 * passages inutiles sous le lock jsdom global, pour un texte de chunk qui ne
 * change pas.
 *
 * Idempotent : une ligne qui n'est plus de type `document` (rejeu, migration
 * concurrente) est ignorée sans erreur.
 */
export const commitBatch = internalMutation({
  args: {
    converted: v.array(
      v.object({
        nodeDataId: v.id("nodeDatas"),
        doc: v.string(),
        versions: v.array(
          v.object({ versionId: v.id("nodeDataVersions"), doc: v.string() }),
        ),
      }),
    ),
  },
  returns: v.object({
    nodeDatas: v.number(),
    versions: v.number(),
    chunks: v.number(),
    canvases: v.number(),
    skipped: v.number(),
  }),
  handler: async (ctx, { converted }) => {
    const counts = {
      nodeDatas: 0,
      versions: 0,
      chunks: 0,
      canvases: 0,
      skipped: 0,
    };
    // canvasId -> ids des nodeDatas migrés, pour ne patcher chaque canvas
    // qu'une fois (son tableau `nodes` est réécrit en entier à chaque patch).
    const byCanvas = new Map<Id<"canvases">, Set<Id<"nodeDatas">>>();

    for (const entry of converted) {
      const nodeData = await ctx.db.get("nodeDatas", entry.nodeDataId);
      if (!nodeData || nodeData.type !== "document") {
        counts.skipped += 1;
        continue;
      }

      await ctx.db.patch("nodeDatas", entry.nodeDataId, {
        type: "blocknote",
        values: { ...nodeData.values, doc: entry.doc },
        updatedAt: Date.now(),
      });
      counts.nodeDatas += 1;

      for (const version of entry.versions) {
        const stored = await ctx.db.get("nodeDataVersions", version.versionId);
        if (!stored || stored.nodeType !== "document") continue;
        await ctx.db.patch("nodeDataVersions", version.versionId, {
          nodeType: "blocknote",
          values: { ...stored.values, doc: version.doc },
        });
        counts.versions += 1;
      }

      // Les chunks restent valides tels quels — leur `text` est déjà du
      // Markdown, et la branche `blocknote` de chunkBuilder en produit le
      // même. Seul `nodeType` (filterField des deux search indexes) est à
      // jour à faire.
      const chunks = await ctx.db
        .query("searchableChunks")
        .withIndex("by_nodeDataId", (q) => q.eq("nodeDataId", entry.nodeDataId))
        .collect();
      for (const chunk of chunks) {
        if (chunk.nodeType !== "document") continue;
        await ctx.db.patch("searchableChunks", chunk._id, {
          nodeType: "blocknote",
        });
        counts.chunks += 1;
      }

      const bucket = byCanvas.get(nodeData.canvasId);
      if (bucket) bucket.add(entry.nodeDataId);
      else byCanvas.set(nodeData.canvasId, new Set([entry.nodeDataId]));
    }

    // Le type du node est dupliqué dans le tableau `nodes` embarqué du canvas :
    // sans ce flip, le canvas continue de monter le composant PlateJS.
    for (const [canvasId, nodeDataIds] of byCanvas) {
      const canvas = await ctx.db.get("canvases", canvasId);
      if (!canvas?.nodes) continue;

      let changed = false;
      const nodes = canvas.nodes.map((node) => {
        if (
          node.type !== "document" ||
          !node.nodeDataId ||
          !nodeDataIds.has(node.nodeDataId)
        ) {
          return node;
        }
        changed = true;
        return { ...node, type: "blocknote" as const };
      });

      if (!changed) continue;
      await ctx.db.patch("canvases", canvasId, { nodes });
      counts.canvases += 1;
    }

    return counts;
  },
});
