"use node";

// Migration en base : nodes `document` (PlateJS) -> `blocknote` (BlockNote).
//
// Ce fichier est le RUNNER : pagination, lots, relais, rapport. La conversion
// d'un document vit dans `plateToBlockNoteConvert.ts`.
//
// Contrainte de débit : `withHeadlessEditor` installe jsdom sur `globalThis` et
// sérialise TOUS ses appels derrière un lock process-global. La migration
// traite donc un document à la fois, quelle que soit la taille du lot. D'où le
// découpage : une page de documents par tour, l'action se re-schedulant sur son
// curseur tant qu'il reste du travail, avec une échéance souple bien en deçà de
// la limite de 10 minutes d'une action.
//
// Ordre d'exploitation :
//   1. `internal.migrations.plateToBlockNoteData.census`  (lecture seule)
//   2. `internal.migrations.plateToBlockNote.migrate` avec `dryRun: true`
//   3. le même sans `dryRun`
//   4. `census` à nouveau : il doit ne plus rien trouver.

import { v } from "convex/values";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalAction } from "../_generated/server";
import { convertDocument, describeError } from "./plateToBlockNoteConvert";

/** Marge confortable sous la limite de 10 min d'une action Convex. */
const SOFT_DEADLINE_MS = 5 * 60 * 1000;
/**
 * Un lot = une transaction d'écriture. Chaque node y apporte son document plus
 * ses versions (jusqu'à `MAX_VERSIONS_PER_NODE`), donc c'est le poids en octets
 * qui borne, pas le nombre de nodes. 5 est volontairement bas : le débit est de
 * toute façon dicté par le lock jsdom, qui traite un document à la fois.
 * Baisser encore via l'argument `pageSize` si un commit dépasse les limites de
 * transaction.
 */
const DEFAULT_PAGE_SIZE = 5;
/** Bornage du rapport : au-delà, seuls les compteurs restent significatifs. */
const MAX_REPORTED_FAILURES = 25;

type Histogram = Record<string, number>;

type Totals = {
  processed: number;
  migrated: number;
  failed: number;
  skipped: number;
  versions: number;
  chunks: number;
  canvases: number;
  degraded: Histogram;
  dropped: Histogram;
  failures: Array<{ nodeDataId: string; reason: string }>;
};

const histogramValidator = v.record(v.string(), v.number());

const totalsValidator = v.object({
  processed: v.number(),
  migrated: v.number(),
  failed: v.number(),
  skipped: v.number(),
  versions: v.number(),
  chunks: v.number(),
  canvases: v.number(),
  degraded: histogramValidator,
  dropped: histogramValidator,
  failures: v.array(v.object({ nodeDataId: v.string(), reason: v.string() })),
});

function emptyTotals(): Totals {
  return {
    processed: 0,
    migrated: 0,
    failed: 0,
    skipped: 0,
    versions: 0,
    chunks: 0,
    canvases: 0,
    degraded: {},
    dropped: {},
    failures: [],
  };
}

function mergeHistogram(into: Histogram, from: Histogram): void {
  for (const [key, value] of Object.entries(from)) {
    into[key] = (into[key] ?? 0) + value;
  }
}

// ── Runner ──────────────────────────────────────────────────────────────────

export const migrate = internalAction({
  args: {
    cursor: v.optional(v.union(v.string(), v.null())),
    pageSize: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
    totals: v.optional(totalsValidator),
  },
  returns: totalsValidator,
  handler: async (ctx, args): Promise<Totals> => {
    const dryRun = args.dryRun ?? false;
    const pageSize = args.pageSize ?? DEFAULT_PAGE_SIZE;
    const totals = args.totals ?? emptyTotals();
    const startedAt = Date.now();

    let cursor: string | null = args.cursor ?? null;
    let isDone = false;

    while (!isDone) {
      const batch: {
        page: Array<{
          nodeDataId: Id<"nodeDatas">;
          canvasId: Id<"canvases">;
          doc: unknown;
          versions: Array<{ versionId: Id<"nodeDataVersions">; doc: unknown }>;
        }>;
        isDone: boolean;
        continueCursor: string;
      } = await ctx.runQuery(
        internal.migrations.plateToBlockNoteData.loadDocumentBatch,
        { paginationOpts: { numItems: pageSize, cursor } },
      );

      const converted: Array<{
        nodeDataId: Id<"nodeDatas">;
        doc: string;
        versions: Array<{ versionId: Id<"nodeDataVersions">; doc: string }>;
      }> = [];

      for (const row of batch.page) {
        totals.processed += 1;

        const result = await convertDocument(row.doc);
        if (!result.ok) {
          totals.failed += 1;
          console.error(
            `❌ nodeData ${row.nodeDataId} laissé en "document" — ${result.reason}`,
          );
          if (totals.failures.length < MAX_REPORTED_FAILURES) {
            totals.failures.push({
              nodeDataId: row.nodeDataId,
              reason: result.reason,
            });
          }
          continue;
        }

        mergeHistogram(totals.degraded, result.stats.degraded);
        mergeHistogram(totals.dropped, result.stats.dropped);

        // Les versions accompagnent leur node dans la même écriture. Une
        // version inconvertible est simplement omise : elle reste en
        // `nodeType: "document"` et le garde de `nodeDataVersions.restore`
        // refusera proprement de la restaurer.
        const versions: Array<{
          versionId: Id<"nodeDataVersions">;
          doc: string;
        }> = [];
        for (const version of row.versions) {
          const versionResult = await convertDocument(version.doc);
          if (versionResult.ok) {
            versions.push({ versionId: version.versionId, doc: versionResult.doc });
          } else {
            console.warn(
              `⚠️ version ${version.versionId} non convertie — ${versionResult.reason}`,
            );
          }
        }

        converted.push({ nodeDataId: row.nodeDataId, doc: result.doc, versions });
      }

      if (!dryRun && converted.length > 0) {
        let counts;
        try {
          counts = await ctx.runMutation(
            internal.migrations.plateToBlockNoteData.commitBatch,
            { converted },
          );
        } catch (error) {
          // La mutation est atomique : rien du lot n'a été écrit. La migration
          // étant idempotente, il suffit de relancer avec un `pageSize` plus
          // petit — d'où l'arrêt franc plutôt qu'un saut silencieux du lot.
          console.error(
            `💥 Écriture du lot impossible (${converted.length} documents) — relancer avec un pageSize plus petit. ${describeError(error)}`,
          );
          throw error;
        }
        totals.migrated += counts.nodeDatas;
        totals.versions += counts.versions;
        totals.chunks += counts.chunks;
        totals.canvases += counts.canvases;
        totals.skipped += counts.skipped;
      } else if (dryRun) {
        totals.migrated += converted.length;
        totals.versions += converted.reduce((n, e) => n + e.versions.length, 0);
      }

      isDone = batch.isDone;
      cursor = batch.continueCursor;

      // En dry-run le curseur avance sans que rien ne change en base, donc la
      // pagination progresse normalement. En run réel les lignes migrées ne
      // matchent plus le filtre `type === "document"` — le curseur reste
      // valide (il pointe sur une position d'index, pas sur un rang), et une
      // relance repart de toute façon proprement du début.
      if (!isDone && Date.now() - startedAt > SOFT_DEADLINE_MS) {
        await ctx.scheduler.runAfter(
          0,
          internal.migrations.plateToBlockNote.migrate,
          { cursor, pageSize, dryRun, totals },
        );
        console.log(
          `⏭️ Migration PlateJS -> BlockNote : relais programmé (${totals.processed} documents traités)`,
        );
        return totals;
      }
    }

    console.log(
      `${dryRun ? "🧪 Dry-run" : "✅ Migration"} PlateJS -> BlockNote terminé : ${JSON.stringify(
        totals,
        null,
        2,
      )}`,
    );
    return totals;
  },
});
