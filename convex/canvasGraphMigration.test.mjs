import assert from "node:assert/strict";
import { afterEach, beforeEach, test, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema.ts";
import { internal } from "./_generated/api.js";
import * as server from "./_generated/server.js";
import { GRAPH_LIMITS } from "./config/canvasGraphConfig.ts";
import * as CanvasNodeModels from "./models/canvasNodeModels.ts";

const modules = {
  ...import.meta.glob("./**/*.{js,ts}"),
  "./_generated/server.js": async () => server,
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

function newTest() {
  return convexTest({ schema, modules, transactionLimits: true });
}

function placement(id, nodeDataId, overrides = {}) {
  return {
    id,
    ...(nodeDataId === undefined ? {} : { nodeDataId }),
    type: "title",
    position: { x: 10, y: 20 },
    width: 220,
    height: 80,
    ...overrides,
  };
}

function connection(id, source, target, overrides = {}) {
  return { id, source, target, ...overrides };
}

function withoutSystemFields(row) {
  const { _id, _creationTime, ...value } = row;
  return value;
}

function mirroredNode(canvasId, node) {
  const { id, nodeDataId, data, ...placementFields } = node;
  const reference = nodeDataId ?? data?.nodeDataId;
  let cleanData;
  if (data !== undefined) {
    const { nodeDataId: _reserved, ...rest } = data;
    void _reserved;
    if (Object.keys(rest).length > 0) cleanData = rest;
  }
  return {
    canvasId,
    nodeId: id,
    ...(reference === undefined ? {} : { nodeDataId: reference }),
    ...placementFields,
    ...(cleanData === undefined ? {} : { data: cleanData }),
  };
}

function mirroredEdge(canvasId, edge) {
  const { id, ...edgeFields } = edge;
  return { canvasId, edgeId: id, ...edgeFields };
}

async function fixture() {
  const t = newTest();
  const { userId, canvasId } = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {});
    const canvasId = await ctx.db.insert("canvases", {
      creatorId: userId,
      name: "migration",
      nodes: [],
      edges: [],
      nodeCount: 0,
      graphRevision: 0,
      graphMigrated: true,
      updatedAt: 0,
    });
    return { userId, canvasId };
  });
  return { t, userId, canvasId };
}

async function addNodeData(t, canvasId, values = {}) {
  return t.run((ctx) =>
    ctx.db.insert("nodeDatas", {
      canvasId,
      type: "title",
      values,
      updatedAt: 0,
    }),
  );
}

async function seedGraph(
  t,
  canvasId,
  nodes,
  edges,
  { revision = 0, migrated = false, mirrors = true } = {},
) {
  await t.run(async (ctx) => {
    await ctx.db.patch("canvases", canvasId, {
      nodes,
      edges,
      nodeCount: nodes.length,
      graphRevision: revision,
      graphMigrated: migrated,
    });
    if (!mirrors) return;
    for (const node of nodes) {
      await ctx.db.insert("nodes", mirroredNode(canvasId, node));
    }
    for (const edge of edges) {
      await ctx.db.insert("edges", mirroredEdge(canvasId, edge));
    }
  });
}

async function enableM1(t) {
  await t.mutation(internal.canvasGraphMigration.setEnabled, { enabled: true });
}

async function driveM1(t, canvasId, { batchSize = 1, maxCalls = 100 } = {}) {
  let result;
  for (let call = 0; call < maxCalls; call++) {
    result = await t.mutation(internal.canvasGraphMigration.workOne, {
      canvasId,
      batchSize,
    });
    if (result.status !== "running") return result;
  }
  throw new Error(`M1 did not reach a terminal state: ${JSON.stringify(result)}`);
}

async function driveToPhase(t, canvasId, phase, maxCalls = 100) {
  for (let call = 0; call < maxCalls; call++) {
    const result = await t.mutation(internal.canvasGraphMigration.workOne, {
      canvasId,
      batchSize: 1,
    });
    if (result.status !== "running") {
      throw new Error(`M1 stopped before ${phase}: ${JSON.stringify(result)}`);
    }
    if (result.phase === phase) return result;
  }
  throw new Error(`M1 did not reach phase ${phase}`);
}

async function migrationState(t, canvasId) {
  return t.run(async (ctx) => ({
    canvas: await ctx.db.get("canvases", canvasId),
    nodes: await ctx.db
      .query("nodes")
      .withIndex("by_canvasId", (q) => q.eq("canvasId", canvasId))
      .take(1000),
    edges: await ctx.db
      .query("edges")
      .withIndex("by_canvasId", (q) => q.eq("canvasId", canvasId))
      .take(1000),
    work: await ctx.db
      .query("canvasGraphMigrations")
      .withIndex("by_canvasId", (q) => q.eq("canvasId", canvasId))
      .take(10),
    errors: await ctx.db
      .query("canvasGraphMigrationErrors")
      .withIndex("by_canvasId", (q) => q.eq("canvasId", canvasId))
      .take(1000),
    controls: await ctx.db.query("canvasGraphMigrationControl").take(10),
    nodeDatas: await ctx.db.query("nodeDatas").take(1000),
    scheduled: await ctx.db.system.query("_scheduled_functions").take(1000),
  }));
}

async function auditInventory(t, table) {
  const reports = [];
  let cursor = null;
  for (let pageNumber = 0; pageNumber < 1000; pageNumber++) {
    const page = await t.query(internal.canvasGraphMigration.auditInventory, {
      table,
      paginationOpts: {
        numItems: 1,
        cursor,
        maximumRowsRead: 1,
        maximumBytesRead: GRAPH_LIMITS.graphBytes,
      },
      legacyInFlightSince: 0,
    });
    reports.push(...page.page);
    if (page.isDone) return reports;
    cursor = page.continueCursor;
  }
  throw new Error(`Inventory pagination did not finish for ${table}`);
}

function sortedValues(rows, key) {
  return rows
    .map(withoutSystemFields)
    .sort((left, right) => left[key].localeCompare(right[key]));
}

test("step 0 graph audit reports missing and divergent mirrors without writing", async () => {
  const { t, canvasId } = await fixture();
  const missingDataId = await addNodeData(t, canvasId, { text: "missing" });
  const divergentDataId = await addNodeData(t, canvasId, { text: "divergent" });
  const nodes = [
    placement("missing-node", missingDataId),
    placement("divergent-node", divergentDataId, {
      data: { label: "authoritative" },
    }),
  ];
  const edges = [
    connection("missing-edge", "missing-node", "divergent-node"),
    connection("divergent-edge", "divergent-node", "missing-node", {
      data: { label: "authoritative" },
    }),
  ];
  await seedGraph(t, canvasId, nodes, edges, {
    revision: 5,
    mirrors: false,
  });
  await t.run(async (ctx) => {
    await ctx.db.insert("nodes", {
      ...mirroredNode(canvasId, nodes[1]),
      position: { x: 999, y: 999 },
    });
    await ctx.db.insert("edges", {
      ...mirroredEdge(canvasId, edges[1]),
      data: { label: "stale" },
    });
  });
  const baseline = await migrationState(t, canvasId);

  const missingNode = await t.query(
    internal.canvasGraphMigration.auditGraphItem,
    { canvasId, section: "nodes", offset: 0, expectedRevision: 5 },
  );
  const divergentNode = await t.query(
    internal.canvasGraphMigration.auditGraphItem,
    { canvasId, section: "nodes", offset: 1, expectedRevision: 5 },
  );
  const missingEdge = await t.query(
    internal.canvasGraphMigration.auditGraphItem,
    { canvasId, section: "edges", offset: 0, expectedRevision: 5 },
  );
  const divergentEdge = await t.query(
    internal.canvasGraphMigration.auditGraphItem,
    { canvasId, section: "edges", offset: 1, expectedRevision: 5 },
  );

  assert.ok(missingNode.item.issues.includes("MIRROR_MISSING"));
  assert.ok(divergentNode.item.issues.includes("NODE_DIFF"));
  assert.ok(missingEdge.item.issues.includes("MIRROR_MISSING"));
  assert.ok(divergentEdge.item.issues.includes("EDGE_DIFF"));
  assert.deepEqual(await migrationState(t, canvasId), baseline);
});

test("M1 inserts missing mirrors, reconciles divergent ones, and recertifies stably", async () => {
  const { t, canvasId } = await fixture();
  const firstDataId = await addNodeData(t, canvasId, { text: "one" });
  const secondDataId = await addNodeData(t, canvasId, { text: "two" });
  const nodes = [
    placement("one", firstDataId, {
      position: { x: -10, y: 4 },
      locked: true,
      zIndex: 3,
      data: { label: "one" },
    }),
    placement("two", secondDataId, {
      position: { x: 40, y: 80 },
      hidden: true,
      color: "blue",
      data: { label: "two" },
    }),
  ];
  const edges = [
    connection("forward", "one", "two", {
      sourceHandle: "out",
      targetHandle: "in",
      markerEnd: { type: "arrow", width: 20 },
      data: { label: "forward" },
    }),
    connection("back", "two", "one", { data: { label: "back" } }),
  ];
  await seedGraph(t, canvasId, nodes, edges, {
    revision: 7,
    mirrors: false,
  });
  await t.run(async (ctx) => {
    await ctx.db.insert("nodes", {
      ...mirroredNode(canvasId, nodes[0]),
      width: 999,
      data: { label: "stale" },
    });
    await ctx.db.insert("edges", {
      ...mirroredEdge(canvasId, edges[0]),
      data: { label: "stale" },
    });
  });
  await enableM1(t);

  const firstPass = await driveM1(t, canvasId, { batchSize: 1 });
  assert.equal(firstPass.status, "certified");
  assert.equal(firstPass.revision, 7);
  assert.equal(firstPass.verifiedNodes, 2);
  assert.equal(firstPass.verifiedEdges, 2);
  assert.equal(firstPass.inserts, 2);
  assert.equal(firstPass.reconciles, 2);

  let state = await migrationState(t, canvasId);
  assert.equal(state.canvas.graphMigrated, true);
  assert.equal(state.canvas.nodeCount, 2);
  assert.deepEqual(sortedValues(state.nodes, "nodeId"), [
    mirroredNode(canvasId, nodes[0]),
    mirroredNode(canvasId, nodes[1]),
  ]);
  assert.deepEqual(sortedValues(state.edges, "edgeId"), [
    mirroredEdge(canvasId, edges[1]),
    mirroredEdge(canvasId, edges[0]),
  ]);
  assert.equal(state.work.length, 1);
  assert.equal(state.work[0].status, "certified");
  assert.equal(state.errors.length, 0);
  assert.equal(state.scheduled.length, 0);

  await t.mutation(internal.canvasGraphMigration.restartCanvas, { canvasId });
  state = await migrationState(t, canvasId);
  assert.equal(state.canvas.graphMigrated, false);
  assert.equal(state.work[0].phase, "nodes");
  assert.equal(state.work[0].inserts, 0);
  assert.equal(state.work[0].reconciles, 0);

  const stablePass = await driveM1(t, canvasId, { batchSize: 1 });
  assert.equal(stablePass.status, "certified");
  assert.equal(stablePass.inserts, 0);
  assert.equal(stablePass.reconciles, 0);
  assert.equal(stablePass.verifiedNodes, 2);
  assert.equal(stablePass.verifiedEdges, 2);
  state = await migrationState(t, canvasId);
  assert.equal(state.canvas.graphMigrated, true);
  assert.equal(state.errors.length, 0);
});

test("extra node and edge rows are reported by inventory and block M1 without deletion", async () => {
  for (const kind of ["node", "edge"]) {
    const { t, canvasId } = await fixture();
    const nodes = [placement("one", undefined), placement("two", undefined)];
    const edges = [connection("legacy", "one", "two")];
    await seedGraph(t, canvasId, nodes, edges, {
      revision: 3,
      migrated: true,
    });
    const extraId = await t.run((ctx) =>
      kind === "node"
        ? ctx.db.insert("nodes", {
            ...mirroredNode(canvasId, placement("extra", undefined)),
          })
        : ctx.db.insert("edges", {
            ...mirroredEdge(
              canvasId,
              connection("extra", "one", "two"),
            ),
          }),
    );

    const inventory = await auditInventory(t, kind === "node" ? "nodes" : "edges");
    const extraReport = inventory.find((item) => item.id === extraId);
    assert.ok(extraReport);
    assert.ok(
      extraReport.issues.includes(
        kind === "node" ? "EXTRA_NODE_BLOCKING" : "EXTRA_EDGE_BLOCKING",
      ),
    );

    await enableM1(t);
    const blocked = await driveM1(t, canvasId, { batchSize: 32 });
    assert.equal(blocked.status, "blocked");
    assert.match(blocked.error, new RegExp(`M1_EXTRA_${kind.toUpperCase()}`));

    let state = await migrationState(t, canvasId);
    assert.equal(state.canvas.graphMigrated, false);
    assert.equal(state.work[0].status, "blocked");
    assert.equal(state.errors.length, 1);
    assert.match(
      state.errors[0].message,
      new RegExp(`M1_EXTRA_${kind.toUpperCase()}`),
    );
    const extras = kind === "node" ? state.nodes : state.edges;
    assert.ok(extras.some((row) => row._id === extraId));

    await t.run((ctx) => ctx.db.delete(extraId));
    await t.mutation(internal.canvasGraphMigration.restartCanvas, { canvasId });
    const repaired = await driveM1(t, canvasId, { batchSize: 1 });
    assert.equal(repaired.status, "certified");
    assert.equal(repaired.inserts, 0);
    assert.equal(repaired.reconciles, 0);
    state = await migrationState(t, canvasId);
    assert.equal(state.canvas.graphMigrated, true);
    assert.equal(state.errors.length, 1, "restart must preserve the append-only error journal");
  }
});

test("a first-batch dry run returns work performed but persists nothing", async () => {
  const { t, canvasId } = await fixture();
  const nodeDataId = await addNodeData(t, canvasId, { text: "dry" });
  const nodes = [placement("node", nodeDataId)];
  const edges = [connection("loop", "node", "node")];
  await seedGraph(t, canvasId, nodes, edges, {
    revision: 4,
    migrated: true,
    mirrors: false,
  });
  await enableM1(t);
  const baseline = await migrationState(t, canvasId);

  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await t.mutation(internal.canvasGraphMigration.workOne, {
      canvasId,
      batchSize: 1,
      dryRun: true,
    });
    assert.equal(result.dryRun, true);
    assert.equal(result.status, "running");
    assert.equal(result.phase, "edges");
    assert.equal(result.inserts, 1);
    assert.deepEqual(await migrationState(t, canvasId), baseline);
  }
});

test("a certification dry run rolls back flags, counts, and durable work", async () => {
  const { t, canvasId } = await fixture();
  const nodeDataId = await addNodeData(t, canvasId, { text: "certify" });
  const nodes = [placement("node", nodeDataId)];
  const edges = [connection("loop", "node", "node")];
  await seedGraph(t, canvasId, nodes, edges, {
    revision: 9,
    migrated: false,
  });
  await t.run(async (ctx) => {
    await ctx.db.patch("canvases", canvasId, { nodeCount: 99 });
    await ctx.db.insert("canvasGraphMigrations", {
      canvasId,
      revision: 9,
      phase: "certify",
      status: "running",
      offset: 0,
      cursor: null,
      verifiedNodes: 1,
      verifiedEdges: 1,
      revisionRestarts: 0,
      attempts: 4,
      inserts: 2,
      reconciles: 1,
      updatedAt: 10,
    });
  });
  await enableM1(t);
  const baseline = await migrationState(t, canvasId);

  const result = await t.mutation(internal.canvasGraphMigration.workOne, {
    canvasId,
    batchSize: 1,
    dryRun: true,
  });
  assert.equal(result.status, "certified");
  assert.equal(result.dryRun, true);
  assert.equal(result.verifiedNodes, 1);
  assert.equal(result.verifiedEdges, 1);
  assert.deepEqual(await migrationState(t, canvasId), baseline);
});

test("a revision change immediately before certification restarts every verification phase", async () => {
  const { t, canvasId } = await fixture();
  const firstDataId = await addNodeData(t, canvasId, { text: "one" });
  const secondDataId = await addNodeData(t, canvasId, { text: "two" });
  const nodes = [placement("one", firstDataId), placement("two", secondDataId)];
  const edges = [connection("edge", "one", "two")];
  await seedGraph(t, canvasId, nodes, edges, { revision: 11 });
  await enableM1(t);

  const readyToCertify = await driveToPhase(t, canvasId, "certify");
  assert.equal(readyToCertify.revision, 11);
  assert.equal(readyToCertify.verifiedNodes, 2);
  assert.equal(readyToCertify.verifiedEdges, 1);

  await t.mutation((ctx) =>
    CanvasNodeModels.updatePositionOrDimensions(ctx, {
      canvasId,
      nodeChanges: [{ id: "one", position: { x: 777, y: -12 } }],
    }),
  );
  let state = await migrationState(t, canvasId);
  assert.equal(state.canvas.graphRevision, 12);
  assert.equal(state.canvas.graphMigrated, false);
  assert.equal(state.work[0].revision, 11);
  assert.equal(state.work[0].phase, "certify");

  const restarted = await t.mutation(internal.canvasGraphMigration.workOne, {
    canvasId,
    batchSize: 32,
  });
  assert.equal(restarted.status, "running");
  assert.equal(restarted.revision, 12);
  assert.equal(restarted.revisionRestarts, 1);
  assert.equal(restarted.phase, "edges");
  assert.equal(restarted.verifiedNodes, 0);
  assert.equal(restarted.verifiedEdges, 0);

  const certified = await driveM1(t, canvasId, { batchSize: 1 });
  assert.equal(certified.status, "certified");
  assert.equal(certified.revision, 12);
  assert.equal(certified.revisionRestarts, 1);
  assert.equal(certified.verifiedNodes, 2);
  assert.equal(certified.verifiedEdges, 1);
  state = await migrationState(t, canvasId);
  assert.equal(state.canvas.graphMigrated, true);
  assert.equal(state.canvas.nodeCount, 2);
  assert.deepEqual(
    state.nodes.find((row) => row.nodeId === "one").position,
    { x: 777, y: -12 },
  );
});
