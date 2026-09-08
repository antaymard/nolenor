import { paginationOptsValidator, paginationResultValidator, type PaginationOptions } from "convex/server";
import { ConvexError, v, type Infer } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";
import { GRAPH_LIMITS, graphValueBytes } from "./config/canvasGraphConfig";
import { extractR2Keys } from "./lib/r2Keys";
import { graphValuesEqual, normalizeCanvasEdge, validateLegacyGraph } from "./models/canvasGraphModels";
import {
  checkedM1Node,
  findM1Work,
  graphRevision,
  initialM1Work,
  m1BatchSize,
  m1ErrorMessage,
  migrationResult,
  processM1Batch,
  requireM1Enabled,
  rollbackM1DryRun,
  withoutSystemFields,
  type MigrationResult,
} from "./models/canvasGraphMigrationModels";
import {
  canvasGraphMigrationErrorsValidator,
  canvasGraphMigrationResultValidator,
  canvasGraphMigrationStatusValidator,
  canvasGraphMigrationsValidator,
} from "./schemas/canvasGraphMigrationSchema";

const workDocument = canvasGraphMigrationsValidator.extend({
  _id: v.id("canvasGraphMigrations"), _creationTime: v.number(),
});
const errorDocument = canvasGraphMigrationErrorsValidator.extend({
  _id: v.id("canvasGraphMigrationErrors"), _creationTime: v.number(),
});

export const setEnabled = internalMutation({
  args: { enabled: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.query("canvasGraphMigrationControl")
      .withIndex("by_name", (q) => q.eq("name", "M1")).unique();
    const value = { name: "M1" as const, enabled: args.enabled, updatedAt: Date.now() };
    if (row) await ctx.db.replace("canvasGraphMigrationControl", row._id, value);
    else await ctx.db.insert("canvasGraphMigrationControl", value);
    return null;
  },
});

// Only workOne should be used by an operator: it bounds this subtransaction and
// records failures outside its rollback. There is deliberately no scheduler here.
export const processBatch = internalMutation({
  args: { canvasId: v.id("canvases"), batchSize: v.number(), dryRun: v.boolean() },
  returns: canvasGraphMigrationResultValidator,
  handler: async (ctx, args): Promise<MigrationResult> => {
    const result = await processM1Batch(ctx, args.canvasId, m1BatchSize(args.batchSize));
    if (args.dryRun) rollbackM1DryRun(result);
    return result;
  },
});

export const workOne = internalMutation({
  args: { canvasId: v.id("canvases"), batchSize: v.optional(v.number()), dryRun: v.optional(v.boolean()) },
  returns: canvasGraphMigrationResultValidator,
  handler: async (ctx, args): Promise<MigrationResult> => {
    const batchSize = m1BatchSize(args.batchSize);
    const dryRun = args.dryRun ?? false;
    let work = await findM1Work(ctx, args.canvasId);
    try {
      await requireM1Enabled(ctx);
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "M1_DISABLED") throw error;
      return { ...migrationResult(args.canvasId, work, dryRun), status: "paused", error: "M1_DISABLED" };
    }
    try {
      return await ctx.runMutation(internal.canvasGraphMigration.processBatch, {
        canvasId: args.canvasId, batchSize, dryRun,
      }, {
        transactionLimits: {
          // Keep parent-read/error-report headroom in the caller after rollback.
          bytesRead: GRAPH_LIMITS.mutationBytes - 1024 * 1024 - 64 * 1024,
          bytesWritten: GRAPH_LIMITS.mutationBytes - 64 * 1024,
          documentsRead: GRAPH_LIMITS.mutationDocuments - 16,
          documentsWritten: GRAPH_LIMITS.mutationItems,
          functionsScheduled: 0,
        },
      });
    } catch (error) {
      const data: unknown = error instanceof ConvexError ? error.data : null;
      if (dryRun && data && typeof data === "object" && "code" in data &&
          data.code === "M1_DRY_RUN_ROLLBACK" && "result" in data) {
        return data.result as MigrationResult;
      }
      const message = m1ErrorMessage(error);
      if (dryRun) {
        return { ...migrationResult(args.canvasId, work, true), status: "blocked", error: message };
      }
      const canvas = await ctx.db.get("canvases", args.canvasId);
      if (!work && canvas) {
        const id = await ctx.db.insert("canvasGraphMigrations", initialM1Work(canvas));
        work = await ctx.db.get("canvasGraphMigrations", id);
      }
      const errorId = await ctx.db.insert("canvasGraphMigrationErrors", {
        canvasId: args.canvasId,
        ...(work ? { workId: work._id } : {}),
        revision: work?.revision ?? canvas?.graphRevision ?? 0,
        observedRevision: canvas?.graphRevision ?? 0,
        phase: work?.phase ?? "nodes",
        offset: work?.offset ?? 0,
        cursor: work?.cursor ?? null,
        attempt: (work?.attempts ?? 0) + 1,
        message,
      });
      if (work) await ctx.db.patch("canvasGraphMigrations", work._id, {
        status: "blocked", lastErrorId: errorId, attempts: work.attempts + 1, updatedAt: Date.now(),
      });
      if (canvas && canvas.graphMigrated !== false) {
        await ctx.db.patch("canvases", canvas._id, { graphMigrated: false });
      }
      return { ...migrationResult(args.canvasId, work, false), status: "blocked", error: message };
    }
  },
});

export const restartCanvas = internalMutation({
  args: { canvasId: v.id("canvases") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireM1Enabled(ctx);
    const canvas = await ctx.db.get("canvases", args.canvasId);
    if (!canvas || canvas.deletedAt !== undefined) throw new Error("M1_CANVAS_GONE");
    const work = await findM1Work(ctx, args.canvasId);
    if (work) await ctx.db.replace("canvasGraphMigrations", work._id, initialM1Work(canvas));
    else await ctx.db.insert("canvasGraphMigrations", initialM1Work(canvas));
    await ctx.db.patch("canvases", canvas._id, { graphMigrated: false });
    return null;
  },
});

function boundedPage(options: PaginationOptions, maximum: number) {
  if (!Number.isInteger(options.numItems) || options.numItems < 1 || options.numItems > maximum ||
      !Number.isInteger(options.maximumRowsRead) || options.maximumRowsRead! < 1 ||
      options.maximumRowsRead! > maximum || !Number.isFinite(options.maximumBytesRead) ||
      options.maximumBytesRead! < 1 || options.maximumBytesRead! > GRAPH_LIMITS.graphBytes) {
    throw new Error(`M1_PAGE_BUDGET: numItems/maximumRowsRead 1..${maximum}; maximumBytesRead 1..${GRAPH_LIMITS.graphBytes}`);
  }
}

export const listWork = internalQuery({
  args: { status: canvasGraphMigrationStatusValidator, paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(workDocument),
  handler: async (ctx, args) => {
    boundedPage(args.paginationOpts, GRAPH_LIMITS.migrationBatch);
    return ctx.db.query("canvasGraphMigrations")
      .withIndex("by_status", (q) => q.eq("status", args.status)).paginate(args.paginationOpts);
  },
});

export const listErrors = internalQuery({
  args: { canvasId: v.optional(v.id("canvases")), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(errorDocument),
  handler: async (ctx, args) => {
    boundedPage(args.paginationOpts, GRAPH_LIMITS.migrationBatch);
    if (args.canvasId) return ctx.db.query("canvasGraphMigrationErrors")
      .withIndex("by_canvasId", (q) => q.eq("canvasId", args.canvasId!)).paginate(args.paginationOpts);
    return ctx.db.query("canvasGraphMigrationErrors").paginate(args.paginationOpts);
  },
});

const auditItemValidator = v.object({
  id: v.string(),
  canvasId: v.optional(v.id("canvases")),
  nodeDataId: v.optional(v.string()),
  metrics: v.record(v.string(), v.number()),
  issues: v.array(v.string()),
});
type AuditItem = Infer<typeof auditItemValidator>;

export const auditInventory = internalQuery({
  args: {
    table: v.union(v.literal("canvases"), v.literal("nodes"), v.literal("edges"),
      v.literal("nodeDatas"), v.literal("searchableChunks"), v.literal("r2Objects"), v.literal("scheduledJobs")),
    paginationOpts: paginationOptsValidator,
    // An operator-supplied cutoff is a triage heuristic, never proof of intent.
    legacyInFlightSince: v.number(),
  },
  returns: paginationResultValidator(auditItemValidator),
  handler: async (ctx, args) => {
    // Hydration can read a full legacy canvas and nodeData for a single row.
    boundedPage(args.paginationOpts, 1);
    if (!Number.isFinite(args.legacyInFlightSince)) throw new Error("M1_INVALID_CUTOFF");
    const page = await ctx.db.query(args.table).paginate(args.paginationOpts);
    const report: AuditItem[] = [];
    for (const item of page.page) {
      const result: AuditItem = { id: item._id, metrics: { documents: 1, bytes: graphValueBytes(item) }, issues: [] };
      report.push(result);
      const { metrics, issues } = result;
      // The table discriminator and document originate from the same query.
      if (args.table === "canvases") {
        const canvas = item as Doc<"canvases">;
        result.canvasId = canvas._id;
        const nodes = canvas.nodes ?? [];
        const edges = canvas.edges ?? [];
        Object.assign(metrics, {
          nodes: nodes.length, edges: edges.length,
          graphBytes: graphValueBytes({ nodes, edges }),
          nodesBytes: graphValueBytes(nodes), edgesBytes: graphValueBytes(edges),
          graphRevision: canvas.graphRevision ?? 0,
          certified: Number(canvas.graphMigrated === true),
          nodeCountPresent: Number(canvas.nodeCount !== undefined),
          deleted: Number(canvas.deletedAt !== undefined),
          nodesArrayPresent: Number(canvas.nodes !== undefined), edgesArrayPresent: Number(canvas.edges !== undefined),
          duplicateNodeIds: nodes.length - new Set(nodes.map((n) => n.id)).size,
          duplicateEdgeIds: edges.length - new Set(edges.map((e) => e.id)).size,
          referenceColumn: nodes.filter((n) => n.nodeDataId !== undefined).length,
          referenceData: nodes.filter((n) => n.data?.nodeDataId !== undefined).length,
          referenceBoth: nodes.filter((n) => n.nodeDataId !== undefined && n.data?.nodeDataId !== undefined).length,
          referenceConflicts: nodes.filter((n) => n.nodeDataId !== undefined && n.data?.nodeDataId !== undefined &&
            n.nodeDataId !== n.data.nodeDataId).length,
        });
        if (canvas.graphMigrated !== true) issues.push("UNCERTIFIED");
        if (canvas.nodeCount !== nodes.length) issues.push("NODE_COUNT_DIFF");
        if (nodes.length > GRAPH_LIMITS.graphNodes || edges.length > GRAPH_LIMITS.graphEdges ||
            metrics.graphBytes > GRAPH_LIMITS.graphBytes) issues.push("GRAPH_BUDGET_EXCEEDED");
        try { graphRevision(canvas); await validateLegacyGraph(ctx, nodes, edges); }
        catch (error) { issues.push(m1ErrorMessage(error)); }
      } else if (args.table === "nodes") {
        const row = item as Doc<"nodes">;
        result.canvasId = row.canvasId;
        if (row.nodeDataId) result.nodeDataId = row.nodeDataId;
        const canvas = await ctx.db.get("canvases", row.canvasId);
        if (!canvas) issues.push("ORPHAN_NODE_NO_CANVAS");
        else {
          metrics.graphRevision = canvas.graphRevision ?? 0;
          if (canvas.deletedAt !== undefined) issues.push("NODE_ON_DELETED_CANVAS");
          const legacy = (canvas.nodes ?? []).find((n) => n.id === row.nodeId);
          if (!legacy) issues.push("EXTRA_NODE_BLOCKING");
          else try {
            const expected = await checkedM1Node(ctx, row.canvasId, legacy);
            if (!graphValuesEqual(expected, withoutSystemFields(row))) issues.push("NODE_DIFF");
          } catch (error) { issues.push(m1ErrorMessage(error)); }
        }
        const duplicates = await ctx.db.query("nodes")
          .withIndex("by_canvasId_and_nodeId", (q) => q.eq("canvasId", row.canvasId).eq("nodeId", row.nodeId)).take(2);
        if (duplicates.length > 1) issues.push("DUPLICATE_NODE_KEY");
        if (row.nodeDataId) {
          const placements = await ctx.db.query("nodes")
            .withIndex("by_nodeDataId", (q) => q.eq("nodeDataId", row.nodeDataId)).take(2);
          if (placements.length > 1) issues.push("GLOBAL_MULTIPLACEMENT");
        }
      } else if (args.table === "edges") {
        const row = item as Doc<"edges">;
        result.canvasId = row.canvasId;
        const canvas = await ctx.db.get("canvases", row.canvasId);
        if (!canvas) issues.push("ORPHAN_EDGE_NO_CANVAS");
        else {
          metrics.graphRevision = canvas.graphRevision ?? 0;
          if (canvas.deletedAt !== undefined) issues.push("EDGE_ON_DELETED_CANVAS");
          const legacy = (canvas.edges ?? []).find((e) => e.id === row.edgeId);
          if (!legacy) issues.push("EXTRA_EDGE_BLOCKING");
          else if (!graphValuesEqual(normalizeCanvasEdge(row.canvasId, legacy), withoutSystemFields(row))) issues.push("EDGE_DIFF");
        }
        const duplicates = await ctx.db.query("edges")
          .withIndex("by_canvasId_and_edgeId", (q) => q.eq("canvasId", row.canvasId).eq("edgeId", row.edgeId)).take(2);
        if (duplicates.length > 1) issues.push("DUPLICATE_EDGE_KEY");
        for (const nodeId of new Set([row.source, row.target])) {
          const endpoint = await ctx.db.query("nodes")
            .withIndex("by_canvasId_and_nodeId", (q) => q.eq("canvasId", row.canvasId).eq("nodeId", nodeId)).take(2);
          if (endpoint.length !== 1) issues.push("EDGE_ENDPOINT_MISSING_OR_DUPLICATED");
        }
      } else if (args.table === "nodeDatas") {
        const row = item as Doc<"nodeDatas">;
        result.canvasId = row.canvasId;
        result.nodeDataId = row._id;
        metrics.valuesBytes = graphValueBytes(row.values);
        metrics.removedFromCanvasAtPresent = Number(row.removedFromCanvasAt !== undefined);
        if (row.removedFromCanvasAt !== undefined) issues.push("REMOVED_FROM_CANVAS_AT_PRESENT");
        const canvas = await ctx.db.get("canvases", row.canvasId);
        if (!canvas) issues.push("ORPHAN_CONTENT_NO_CANVAS");
        if (canvas) metrics.graphRevision = canvas.graphRevision ?? 0;
        if (canvas?.deletedAt !== undefined) issues.push("CONTENT_ON_DELETED_CANVAS");
        const references = (canvas?.nodes ?? []).filter((n) => n.nodeDataId === row._id || n.data?.nodeDataId === row._id);
        metrics.legacyPlacements = references.length;
        if (references.length === 0) issues.push(row._creationTime >= args.legacyInFlightSince
          ? "RECENT_UNPLACED_CANDIDATE" : "HISTORICAL_UNPLACED_CANDIDATE");
        if (references.length > 1) issues.push("LEGACY_MULTIPLACEMENT");
        const placements = await ctx.db.query("nodes")
          .withIndex("by_nodeDataId", (q) => q.eq("nodeDataId", row._id)).take(2);
        metrics.mirrorPlacementsAtLeast = placements.length;
        if (placements.length > 1) issues.push("GLOBAL_MULTIPLACEMENT");
        if (placements.some((n) => n.canvasId !== row.canvasId || n.type !== row.type)) issues.push("CONTENT_PLACEMENT_CONFLICT");
        const template = row.templateId ? await ctx.db.get("nodeTemplates", row.templateId) : null;
        if ((row.templateId && !template) || (row.type === "custom" && !row.templateId)) issues.push("TEMPLATE_MISSING");
        metrics.declaredR2Keys = extractR2Keys(row, template ?? undefined).length;
      } else if (args.table === "searchableChunks") {
        const row = item as Doc<"searchableChunks">;
        result.canvasId = row.canvasId;
        result.nodeDataId = row.nodeDataId;
        metrics.textBytes = graphValueBytes(row.text);
        const content = await ctx.db.get("nodeDatas", row.nodeDataId);
        const canvas = await ctx.db.get("canvases", row.canvasId);
        if (!content) issues.push("ORPHAN_CHUNK_NO_CONTENT");
        else {
          if (content.canvasId !== row.canvasId) issues.push("CHUNK_FOREIGN_CANVAS");
          if (content.type !== row.nodeType) issues.push("CHUNK_TYPE_CONFLICT");
          if (row.templateId !== undefined && row.templateId !== content.templateId) issues.push("CHUNK_TEMPLATE_CONFLICT");
        }
        if (!canvas) issues.push("ORPHAN_CHUNK_NO_CANVAS");
        else {
          metrics.graphRevision = canvas.graphRevision ?? 0;
          if (canvas.deletedAt !== undefined) issues.push("CHUNK_ON_DELETED_CANVAS");
          const node = (canvas.nodes ?? []).find((n) => n.id === row.nodeId);
          if (!node) issues.push("ORPHAN_CHUNK_NO_PLACEMENT");
          else if ((node.nodeDataId ?? node.data?.nodeDataId) !== row.nodeDataId) issues.push("CHUNK_PLACEMENT_CONFLICT");
        }
      } else if (args.table === "r2Objects") {
        const row = item as Doc<"r2Objects">;
        result.nodeDataId = row.nodeDataId;
        metrics.keyBytes = graphValueBytes(row.key);
        const content = await ctx.db.get("nodeDatas", row.nodeDataId);
        if (!content) issues.push("ORPHAN_R2_REFERENCE_NO_CONTENT");
        else {
          result.canvasId = content.canvasId;
          const template = content.templateId ? await ctx.db.get("nodeTemplates", content.templateId) : null;
          if (!extractR2Keys(content, template ?? undefined).includes(row.key)) issues.push("R2_REFERENCE_NOT_IN_CURRENT_VALUES");
        }
      } else {
        const row = item as Doc<"scheduledJobs">;
        issues.push("SCHEDULED_JOBS_DOCUMENT_PRESENT");
        if (row.nodesDataId) {
          result.nodeDataId = row.nodesDataId;
          if (!(await ctx.db.get("nodeDatas", row.nodesDataId))) issues.push("ORPHAN_SCHEDULED_JOB_NO_CONTENT");
        }
        const job = await ctx.db.system.get("_scheduled_functions", row.jobId);
        metrics.scheduledFunctionPresent = Number(job !== null);
        if (job) issues.push(`SCHEDULED_FUNCTION_${job.state.kind.toUpperCase()}`);
      }
    }
    return { ...page, page: report };
  },
});

// One array item per call avoids multiplying potentially 1 MiB content reads.
// Each returned nodeDataId is also an offline global-uniqueness manifest entry.
export const auditGraphItem = internalQuery({
  args: { canvasId: v.id("canvases"), section: v.union(v.literal("nodes"), v.literal("edges")),
    offset: v.number(), expectedRevision: v.number() },
  returns: v.object({ revision: v.number(), restartRequired: v.boolean(), isDone: v.boolean(),
    nextOffset: v.number(), item: v.union(auditItemValidator, v.null()) }),
  handler: async (ctx, args) => {
    if (!Number.isSafeInteger(args.offset) || args.offset < 0) throw new Error("M1_INVALID_OFFSET");
    if (!Number.isSafeInteger(args.expectedRevision) || args.expectedRevision < 0) throw new Error("M1_INVALID_REVISION");
    const canvas = await ctx.db.get("canvases", args.canvasId);
    if (!canvas) throw new Error("M1_CANVAS_GONE");
    const revision = graphRevision(canvas);
    if (revision !== args.expectedRevision) {
      return { revision, restartRequired: true, isDone: false, nextOffset: 0, item: null };
    }
    const items = args.section === "nodes" ? canvas.nodes ?? [] : canvas.edges ?? [];
    if (args.offset > items.length) throw new Error("M1_OFFSET_OUT_OF_RANGE");
    if (args.offset >= items.length) {
      return { revision, restartRequired: false, isDone: true, nextOffset: items.length, item: null };
    }
    const result: AuditItem = { id: items[args.offset].id, canvasId: canvas._id,
      metrics: { items: 1, bytes: graphValueBytes(items[args.offset]) }, issues: [] };
    if (canvas.deletedAt !== undefined) result.issues.push("DELETED_CANVAS");
    if (args.section === "nodes") {
      const node = canvas.nodes![args.offset];
      const reference = node.nodeDataId ?? node.data?.nodeDataId;
      if (typeof reference === "string") result.nodeDataId = reference;
      result.metrics.referenceColumn = Number(node.nodeDataId !== undefined);
      result.metrics.referenceData = Number(node.data?.nodeDataId !== undefined);
      if (node.nodeDataId !== undefined && node.data?.nodeDataId !== undefined && node.nodeDataId !== node.data.nodeDataId) {
        result.issues.push("REFERENCE_DOMICILE_CONFLICT");
      }
      try {
        const expected = await checkedM1Node(ctx, canvas._id, node);
        const rows = await ctx.db.query("nodes")
          .withIndex("by_canvasId_and_nodeId", (q) => q.eq("canvasId", canvas._id).eq("nodeId", node.id)).take(2);
        if (!rows.length) result.issues.push("MIRROR_MISSING");
        else if (rows.length > 1) result.issues.push("DUPLICATE_NODE_KEY");
        else if (!graphValuesEqual(expected, withoutSystemFields(rows[0]))) result.issues.push("NODE_DIFF");
      } catch (error) { result.issues.push(m1ErrorMessage(error)); }
    } else {
      const edge = canvas.edges![args.offset];
      const rows = await ctx.db.query("edges")
        .withIndex("by_canvasId_and_edgeId", (q) => q.eq("canvasId", canvas._id).eq("edgeId", edge.id)).take(2);
      if (!rows.length) result.issues.push("MIRROR_MISSING");
      else if (rows.length > 1) result.issues.push("DUPLICATE_EDGE_KEY");
      else if (!graphValuesEqual(normalizeCanvasEdge(canvas._id, edge), withoutSystemFields(rows[0]))) result.issues.push("EDGE_DIFF");
    }
    return { revision, restartRequired: false, isDone: args.offset + 1 === items.length,
      nextOffset: args.offset + 1, item: result };
  },
});
