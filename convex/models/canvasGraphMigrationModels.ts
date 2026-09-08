import { ConvexError, type Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { GRAPH_LIMITS, graphValueBytes } from "../config/canvasGraphConfig";
import { canvasGraphMigrationResultValidator } from "../schemas/canvasGraphMigrationSchema";
import {
  graphValuesEqual,
  normalizeCanvasEdge,
  normalizeCanvasNode,
  upsertEdgeMirror,
  upsertNodeMirror,
  validateLegacyGraph,
} from "./canvasGraphModels";

type ReadCtx = Pick<QueryCtx, "db">;
type LegacyNode = NonNullable<Doc<"canvases">["nodes"]>[number];
export type MigrationResult = Infer<typeof canvasGraphMigrationResultValidator>;

export async function requireM1Enabled(ctx: ReadCtx) {
  const control = await ctx.db
    .query("canvasGraphMigrationControl")
    .withIndex("by_name", (q) => q.eq("name", "M1"))
    .unique();
  if (!control?.enabled) throw new Error("M1_DISABLED");
}

export function graphRevision(canvas: Doc<"canvases">) {
  const revision = canvas.graphRevision ?? 0;
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw new Error("M1_INVALID_REVISION");
  }
  return revision;
}

export function initialM1Work(canvas: Doc<"canvases">) {
  return {
    canvasId: canvas._id,
    revision: canvas.graphRevision ?? 0,
    phase: "nodes" as const,
    status: "pending" as const,
    offset: 0,
    cursor: null,
    verifiedNodes: 0,
    verifiedEdges: 0,
    revisionRestarts: 0,
    attempts: 0,
    inserts: 0,
    reconciles: 0,
    updatedAt: Date.now(),
  };
}

export async function findM1Work(ctx: ReadCtx, canvasId: Id<"canvases">) {
  return ctx.db
    .query("canvasGraphMigrations")
    .withIndex("by_canvasId", (q) => q.eq("canvasId", canvasId))
    .unique();
}

export async function seedM1Canvas(ctx: MutationCtx, canvas: Doc<"canvases">) {
  await requireM1Enabled(ctx);
  if (!(await findM1Work(ctx, canvas._id))) {
    await ctx.db.insert("canvasGraphMigrations", initialM1Work(canvas));
  }
}

export function migrationResult(
  canvasId: Id<"canvases">,
  work: Doc<"canvasGraphMigrations"> | null,
  dryRun: boolean,
): MigrationResult {
  return {
    canvasId,
    status: work?.status ?? "gone",
    phase: work?.phase ?? "nodes",
    revision: work?.revision ?? 0,
    offset: work?.offset ?? 0,
    cursor: work?.cursor ?? null,
    verifiedNodes: work?.verifiedNodes ?? 0,
    verifiedEdges: work?.verifiedEdges ?? 0,
    revisionRestarts: work?.revisionRestarts ?? 0,
    inserts: work?.inserts ?? 0,
    reconciles: work?.reconciles ?? 0,
    dryRun,
  };
}

export function withoutSystemFields<T extends { _id: unknown; _creationTime: number }>(row: T) {
  const { _id, _creationTime, ...value } = row;
  void _id;
  void _creationTime;
  return value;
}

// Read-only checks are shared by backfill, reverse verification and audit.
export async function checkedM1Node(ctx: ReadCtx, canvasId: Id<"canvases">, node: LegacyNode) {
  const row = await normalizeCanvasNode(ctx, canvasId, node);
  if (row.nodeDataId) {
    const content = await ctx.db.get("nodeDatas", row.nodeDataId);
    if (!content) throw new Error(`M1_NODE_DATA_MISSING:${node.id}`);
    if (content.canvasId !== canvasId) throw new Error(`M1_NODE_DATA_FOREIGN:${node.id}`);
    if (content.type !== row.type) throw new Error(`M1_NODE_DATA_TYPE:${node.id}`);
    if (node.data?.templateId !== undefined && node.data.templateId !== content.templateId) {
      throw new Error(`M1_TEMPLATE_COPY_CONFLICT:${node.id}`);
    }
    if (content.type === "custom" && !content.templateId) {
      throw new Error(`M1_TEMPLATE_MISSING:${node.id}`);
    }
    if (content.templateId && !(await ctx.db.get("nodeTemplates", content.templateId))) {
      throw new Error(`M1_TEMPLATE_MISSING:${node.id}`);
    }
    const placements = await ctx.db
      .query("nodes")
      .withIndex("by_nodeDataId", (q) => q.eq("nodeDataId", row.nodeDataId))
      .take(2);
    if (placements.length > 1 || placements.some((p) => p.canvasId !== canvasId || p.nodeId !== node.id)) {
      throw new Error(`M1_NODE_DATA_MULTIPLACEMENT:${node.id}`);
    }
  }
  return row;
}

export function m1BatchSize(value: number = GRAPH_LIMITS.migrationBatch) {
  if (!Number.isInteger(value) || value < 1 || value > GRAPH_LIMITS.migrationBatch) {
    throw new Error(`M1_BATCH_SIZE:1..${GRAPH_LIMITS.migrationBatch}`);
  }
  return value;
}

export async function processM1Batch(
  ctx: MutationCtx,
  canvasId: Id<"canvases">,
  batchSize: number,
): Promise<MigrationResult> {
  await requireM1Enabled(ctx);
  const canvas = await ctx.db.get("canvases", canvasId);
  let work = await findM1Work(ctx, canvasId);
  if (!canvas || canvas.deletedAt !== undefined) {
    if (work) {
      await ctx.db.patch("canvasGraphMigrations", work._id, { status: "gone", updatedAt: Date.now() });
    }
    // Never recreate a deleted placement/parent, nor run a purge from M1.
    return { ...migrationResult(canvasId, work, false), status: "gone" };
  }
  if (!work) {
    const id = await ctx.db.insert("canvasGraphMigrations", initialM1Work(canvas));
    work = await ctx.db.get("canvasGraphMigrations", id);
  }
  if (!work) throw new Error("M1_WORK_MISSING");
  if (work.status === "blocked" || work.status === "certified" || work.status === "gone") {
    return migrationResult(canvasId, work, false);
  }

  const revision = graphRevision(canvas);
  const nodes = canvas.nodes ?? [];
  const edges = canvas.edges ?? [];
  if (nodes.length > GRAPH_LIMITS.graphNodes || edges.length > GRAPH_LIMITS.graphEdges ||
      graphValueBytes({ nodes, edges }) > GRAPH_LIMITS.graphBytes) {
    throw new Error("M1_GRAPH_BUDGET_EXCEEDED");
  }
  await validateLegacyGraph(ctx, nodes, edges);

  const next = { ...withoutSystemFields(work), status: "running" as Doc<"canvasGraphMigrations">["status"],
    attempts: work.attempts + 1, updatedAt: Date.now() };
  if (next.revision !== revision) {
    next.revision = revision;
    next.phase = "nodes";
    next.offset = 0;
    next.cursor = null;
    next.verifiedNodes = 0;
    next.verifiedEdges = 0;
    next.revisionRestarts += 1;
  }
  if (canvas.graphMigrated !== false) {
    await ctx.db.patch("canvases", canvasId, { graphMigrated: false });
  }

  if (next.phase === "nodes" || next.phase === "edges") {
    const isNodes = next.phase === "nodes";
    const end = Math.min(next.offset + batchSize, isNodes ? nodes.length : edges.length);
    for (; next.offset < end; next.offset++) {
      if (isNodes) {
        const node = nodes[next.offset];
        const row = await checkedM1Node(ctx, canvasId, node);
        const existing = await ctx.db.query("nodes")
          .withIndex("by_canvasId_and_nodeId", (q) => q.eq("canvasId", canvasId).eq("nodeId", node.id))
          .take(2);
        if (existing.length > 1) throw new Error(`M1_DUPLICATE_NODE:${node.id}`);
        if (!existing[0] || !graphValuesEqual(row, withoutSystemFields(existing[0]))) {
          if (!existing[0]) next.inserts++;
          else next.reconciles++;
          await upsertNodeMirror(ctx, canvasId, node);
        }
      } else {
        const edge = edges[next.offset];
        const row = normalizeCanvasEdge(canvasId, edge);
        const existing = await ctx.db.query("edges")
          .withIndex("by_canvasId_and_edgeId", (q) => q.eq("canvasId", canvasId).eq("edgeId", edge.id))
          .take(2);
        if (existing.length > 1) throw new Error(`M1_DUPLICATE_EDGE:${edge.id}`);
        if (!existing[0] || !graphValuesEqual(row, withoutSystemFields(existing[0]))) {
          if (!existing[0]) next.inserts++;
          else next.reconciles++;
          await upsertEdgeMirror(ctx, canvasId, edge);
        }
      }
    }
    if (next.offset === (isNodes ? nodes.length : edges.length)) {
      next.phase = isNodes ? "edges" : "verifyNodes";
      next.offset = 0;
      next.cursor = null;
    }
  } else if (next.phase === "verifyNodes") {
    const page = await ctx.db.query("nodes")
      .withIndex("by_canvasId", (q) => q.eq("canvasId", canvasId))
      .paginate({ numItems: batchSize, cursor: next.cursor, maximumRowsRead: batchSize,
        maximumBytesRead: GRAPH_LIMITS.graphBytes });
    const byId = new Map(nodes.map((node) => [node.id, node]));
    for (const row of page.page) {
      const legacy = byId.get(row.nodeId);
      if (!legacy) throw new Error(`M1_EXTRA_NODE:${row._id}`);
      const expected = await checkedM1Node(ctx, canvasId, legacy);
      const duplicates = await ctx.db.query("nodes")
        .withIndex("by_canvasId_and_nodeId", (q) => q.eq("canvasId", canvasId).eq("nodeId", row.nodeId))
        .take(2);
      if (duplicates.length !== 1) throw new Error(`M1_DUPLICATE_NODE:${row.nodeId}`);
      if (!graphValuesEqual(expected, withoutSystemFields(row))) throw new Error(`M1_NODE_DIFF:${row.nodeId}`);
    }
    next.verifiedNodes += page.page.length;
    next.cursor = page.continueCursor;
    if (page.isDone) {
      if (next.verifiedNodes !== nodes.length) throw new Error("M1_NODE_COUNT_DIFF");
      next.phase = "verifyEdges";
      next.cursor = null;
    }
  } else if (next.phase === "verifyEdges") {
    const page = await ctx.db.query("edges")
      .withIndex("by_canvasId", (q) => q.eq("canvasId", canvasId))
      .paginate({ numItems: batchSize, cursor: next.cursor, maximumRowsRead: batchSize,
        maximumBytesRead: GRAPH_LIMITS.graphBytes });
    const byId = new Map(edges.map((edge) => [edge.id, edge]));
    for (const row of page.page) {
      const legacy = byId.get(row.edgeId);
      if (!legacy) throw new Error(`M1_EXTRA_EDGE:${row._id}`);
      const duplicates = await ctx.db.query("edges")
        .withIndex("by_canvasId_and_edgeId", (q) => q.eq("canvasId", canvasId).eq("edgeId", row.edgeId))
        .take(2);
      if (duplicates.length !== 1) throw new Error(`M1_DUPLICATE_EDGE:${row.edgeId}`);
      if (!graphValuesEqual(normalizeCanvasEdge(canvasId, legacy), withoutSystemFields(row))) {
        throw new Error(`M1_EDGE_DIFF:${row.edgeId}`);
      }
    }
    next.verifiedEdges += page.page.length;
    next.cursor = page.continueCursor;
    if (page.isDone) {
      if (next.verifiedEdges !== edges.length) throw new Error("M1_EDGE_COUNT_DIFF");
      next.phase = "certify";
      next.cursor = null;
    }
  } else {
    // This transaction reread the arrays and revision above. A concurrent writer
    // conflicts with this read; a revision change resets all checks, not just offsets.
    if (next.verifiedNodes !== nodes.length || next.verifiedEdges !== edges.length) {
      throw new Error("M1_CERTIFICATION_COUNT_DIFF");
    }
    await ctx.db.patch("canvases", canvasId, { nodeCount: nodes.length, graphMigrated: true });
    next.status = "certified";
    next.certifiedAt = Date.now();
  }
  await ctx.db.replace("canvasGraphMigrations", work._id, next);
  return migrationResult(canvasId, { ...work, ...next }, false);
}

export function m1ErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 1000);
}

export function rollbackM1DryRun(result: MigrationResult): never {
  // Throw INSIDE the nested mutation: mirrors, work, counts and flags roll back.
  throw new ConvexError({ code: "M1_DRY_RUN_ROLLBACK", result: { ...result, dryRun: true } });
}
