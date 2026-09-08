import assert from "node:assert/strict";
import { afterEach, beforeEach, test, vi } from "vitest";
import { convexTest } from "convex-test";
import { v } from "convex/values";
import schema from "./schema.ts";
import * as server from "./_generated/server.js";
import * as CanvasNodeModels from "./models/canvasNodeModels.ts";
import * as CanvasEdgeModels from "./models/canvasEdgeModels.ts";

const modules = {
  ...import.meta.glob("./**/*.{js,ts}"),
  "./_generated/server.js": async () => server,
  "./uploads.ts": async () => ({
    deleteR2Files: server.internalAction({
      args: { keys: v.array(v.string()) },
      returns: v.null(),
      handler: async () => null,
    }),
  }),
  "./searchable/chunkBuilder.ts": async () => ({
    rebuildChunks: server.internalAction({
      args: {
        nodeDataId: v.id("nodeDatas"),
        updatedKeys: v.optional(v.array(v.string())),
      },
      returns: v.null(),
      handler: async () => null,
    }),
    rebuildChunksBatch: server.internalAction({
      args: { nodeDataIds: v.array(v.id("nodeDatas")) },
      returns: v.null(),
      handler: async () => null,
    }),
  }),
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
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {});
    const foreignUserId = await ctx.db.insert("users", {});
    const canvasId = await ctx.db.insert("canvases", {
      creatorId: userId,
      name: "source",
      nodes: [],
      edges: [],
      nodeCount: 0,
      graphRevision: 0,
      graphMigrated: true,
      updatedAt: 0,
    });
    const targetCanvasId = await ctx.db.insert("canvases", {
      creatorId: userId,
      name: "target",
      nodes: [],
      edges: [],
      nodeCount: 0,
      graphRevision: 0,
      graphMigrated: true,
      updatedAt: 0,
    });
    const foreignCanvasId = await ctx.db.insert("canvases", {
      creatorId: foreignUserId,
      name: "foreign",
      nodes: [],
      edges: [],
      nodeCount: 0,
      graphRevision: 0,
      graphMigrated: true,
      updatedAt: 0,
    });
    return { userId, foreignUserId, canvasId, targetCanvasId, foreignCanvasId };
  });
  return { t, ...ids };
}

async function addNodeData(t, canvasId, type = "title", values = {}) {
  return t.run((ctx) =>
    ctx.db.insert("nodeDatas", { canvasId, type, values, updatedAt: 0 }),
  );
}

async function seedGraph(
  t,
  canvasId,
  nodes,
  edges,
  { revision = 0, migrated = true, mirror = true } = {},
) {
  await t.run(async (ctx) => {
    await ctx.db.patch("canvases", canvasId, {
      nodes,
      edges,
      nodeCount: nodes.length,
      graphRevision: revision,
      graphMigrated: migrated,
    });
    if (!mirror) return;
    for (const node of nodes) {
      await ctx.db.insert("nodes", mirroredNode(canvasId, node));
    }
    for (const edge of edges) {
      await ctx.db.insert("edges", mirroredEdge(canvasId, edge));
    }
  });
}

async function canvasState(t, canvasId) {
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
  }));
}

async function completeState(t, canvasIds) {
  return t.run(async (ctx) => {
    const canvases = [];
    for (const canvasId of canvasIds) canvases.push(await ctx.db.get(canvasId));
    return {
      canvases,
      nodes: await ctx.db.query("nodes").take(1000),
      edges: await ctx.db.query("edges").take(1000),
      nodeDatas: await ctx.db.query("nodeDatas").take(1000),
      chunks: await ctx.db.query("searchableChunks").take(1000),
      scheduled: await ctx.db.system.query("_scheduled_functions").take(1000),
    };
  });
}

function sortedIds(rows, key) {
  return rows.map((row) => row[key]).sort();
}

test("node addition rejects invalid references and duplicate identities atomically", async () => {
  const { t, canvasId, foreignCanvasId } = await fixture();
  const localDataId = await addNodeData(t, canvasId);
  const secondLocalDataId = await addNodeData(t, canvasId);
  const wrongTypeDataId = await addNodeData(t, canvasId, "image");
  const foreignDataId = await addNodeData(t, foreignCanvasId);

  const cases = [
    {
      label: "foreign content after a valid placement",
      nodes: [
        placement("valid-before-foreign", localDataId),
        placement("foreign", foreignDataId),
      ],
      error: /Invalid nodeData reference/,
    },
    {
      label: "wrong content type after a valid placement",
      nodes: [
        placement("valid-before-type", localDataId),
        placement("wrong-type", wrongTypeDataId),
      ],
      error: /Invalid nodeData reference/,
    },
    {
      label: "conflicting reference domiciles",
      nodes: [
        placement("conflict", localDataId, {
          data: { nodeDataId: secondLocalDataId },
        }),
      ],
      error: /Conflicting nodeData references/,
    },
    {
      label: "one nodeData placed twice in the batch",
      nodes: [
        placement("first-placement", localDataId),
        placement("second-placement", localDataId),
      ],
      error: /multiple placements/,
    },
    {
      label: "duplicate node IDs in the batch",
      nodes: [
        placement("duplicate-id", localDataId),
        placement("duplicate-id", secondLocalDataId),
      ],
      error: /contains duplicate IDs/,
    },
  ];

  const baseline = await completeState(t, [canvasId]);
  for (const candidate of cases) {
    await assert.rejects(
      t.mutation((ctx) =>
        CanvasNodeModels.addCanvasNodes(ctx, {
          canvasId,
          canvasNodes: candidate.nodes,
        }),
      ),
      candidate.error,
      candidate.label,
    );
    assert.deepEqual(
      await completeState(t, [canvasId]),
      baseline,
      `${candidate.label} must not leave a legacy row, mirror, counter, revision, or job`,
    );
  }
});

test("an existing node ID rejects the whole batch", async () => {
  const { t, canvasId } = await fixture();
  const existingDataId = await addNodeData(t, canvasId);
  const newDataId = await addNodeData(t, canvasId);
  const otherDataId = await addNodeData(t, canvasId);
  await seedGraph(t, canvasId, [placement("existing", existingDataId)], [], {
    revision: 4,
  });
  const baseline = await completeState(t, [canvasId]);

  await assert.rejects(
    t.mutation((ctx) =>
      CanvasNodeModels.addCanvasNodes(ctx, {
        canvasId,
        canvasNodes: [
          placement("would-be-new", newDataId),
          placement("existing", otherDataId),
        ],
      }),
    ),
    /Node ID already exists/,
  );
  assert.deepEqual(await completeState(t, [canvasId]), baseline);
});

test("legacy data.nodeDataId is promoted and removed from both stored representations", async () => {
  const { t, canvasId } = await fixture();
  const nodeDataId = await addNodeData(t, canvasId);
  const legacyNode = placement("fallback", undefined, {
    position: { x: -12, y: 45 },
    width: 333,
    height: 144,
    locked: true,
    hidden: false,
    zIndex: 9,
    color: "violet",
    variant: "wide",
    extent: [
      [0, 0],
      [500, 500],
    ],
    extendParent: true,
    data: { nodeDataId, label: "preserved", nested: { value: 1 } },
  });

  assert.equal(
    await t.mutation((ctx) =>
      CanvasNodeModels.addCanvasNodes(ctx, {
        canvasId,
        canvasNodes: [legacyNode],
      }),
    ),
    true,
  );

  const { canvas, nodes } = await canvasState(t, canvasId);
  assert.equal(canvas.nodes[0].nodeDataId, nodeDataId);
  assert.deepEqual(canvas.nodes[0].data, {
    label: "preserved",
    nested: { value: 1 },
  });
  assert.equal(canvas.nodes[0].data.nodeDataId, undefined);
  assert.equal(canvas.nodeCount, 1);
  assert.equal(canvas.graphRevision, 1);

  assert.equal(nodes.length, 1);
  const mirror = withoutSystemFields(nodes[0]);
  assert.equal(mirror.nodeDataId, nodeDataId);
  assert.equal(mirror.data.nodeDataId, undefined);
  assert.deepEqual(mirror, {
    ...mirroredNode(canvasId, legacyNode),
    nodeDataId,
  });
});

test("geometry and display props upsert complete mirrors while reserved data is rejected", async () => {
  const { t, canvasId } = await fixture();
  const nodeDataId = await addNodeData(t, canvasId);
  await seedGraph(
    t,
    canvasId,
    [placement("node", nodeDataId, { data: { label: "old", untouched: 1 } })],
    [],
    { revision: 3 },
  );

  await t.mutation((ctx) =>
    CanvasNodeModels.updatePositionOrDimensions(ctx, {
      canvasId,
      nodeChanges: [
        {
          id: "node",
          position: { x: 101, y: -44 },
          dimensions: { width: 640, height: 360 },
        },
      ],
    }),
  );
  let state = await canvasState(t, canvasId);
  assert.deepEqual(state.canvas.nodes[0].position, { x: 101, y: -44 });
  assert.equal(state.canvas.nodes[0].width, 640);
  assert.equal(state.canvas.nodes[0].height, 360);
  assert.deepEqual(state.nodes[0].position, { x: 101, y: -44 });
  assert.equal(state.nodes[0].width, 640);
  assert.equal(state.nodes[0].height, 360);
  assert.equal(state.canvas.graphRevision, 4);

  await t.mutation((ctx) =>
    CanvasNodeModels.updateCanvasNodes(ctx, {
      canvasId,
      nodeProps: [
        {
          id: "node",
          props: {
            locked: true,
            hidden: true,
            zIndex: 42,
            color: "amber",
            variant: "compact",
          },
          data: { label: "new", extra: { enabled: true } },
        },
      ],
    }),
  );
  state = await canvasState(t, canvasId);
  for (const row of [state.canvas.nodes[0], state.nodes[0]]) {
    assert.equal(row.locked, true);
    assert.equal(row.hidden, true);
    assert.equal(row.zIndex, 42);
    assert.equal(row.color, "amber");
    assert.equal(row.variant, "compact");
    assert.deepEqual(row.data, {
      label: "new",
      untouched: 1,
      extra: { enabled: true },
    });
  }
  assert.equal(state.canvas.graphRevision, 5);

  const baseline = await completeState(t, [canvasId]);
  for (const data of [{ nodeDataId }, { templateId: "reserved" }]) {
    await assert.rejects(
      t.mutation((ctx) =>
        CanvasNodeModels.updateCanvasNodes(ctx, {
          canvasId,
          nodeProps: [{ id: "node", data }],
        }),
      ),
      /references cannot be patched as display data/,
    );
    assert.deepEqual(await completeState(t, [canvasId]), baseline);
  }
});

test("edge admission rejects missing endpoints and rolls back late duplicate-mirror failures", async () => {
  const { t, canvasId } = await fixture();
  const firstDataId = await addNodeData(t, canvasId);
  const secondDataId = await addNodeData(t, canvasId);
  await seedGraph(
    t,
    canvasId,
    [placement("one", firstDataId), placement("two", secondDataId)],
    [],
    { revision: 2 },
  );

  let baseline = await completeState(t, [canvasId]);
  await assert.rejects(
    t.mutation((ctx) =>
      CanvasEdgeModels.addCanvasEdges(ctx, {
        canvasId,
        edges: [
          connection("valid-first", "one", "two"),
          connection("orphan", "one", "missing"),
        ],
      }),
    ),
    /missing endpoint/,
  );
  assert.deepEqual(await completeState(t, [canvasId]), baseline);

  await assert.rejects(
    t.mutation((ctx) =>
      CanvasEdgeModels.addCanvasEdges(ctx, {
        canvasId,
        edges: [
          connection("duplicate", "one", "two"),
          connection("duplicate", "two", "one"),
        ],
      }),
    ),
    /contains duplicate IDs/,
  );
  assert.deepEqual(await completeState(t, [canvasId]), baseline);

  await t.run(async (ctx) => {
    await ctx.db.insert(
      "edges",
      mirroredEdge(canvasId, connection("blocked", "one", "two")),
    );
    await ctx.db.insert(
      "edges",
      mirroredEdge(canvasId, connection("blocked", "one", "two")),
    );
  });
  baseline = await completeState(t, [canvasId]);
  await assert.rejects(
    t.mutation((ctx) =>
      CanvasEdgeModels.addCanvasEdges(ctx, {
        canvasId,
        edges: [
          connection("inserted-before-error", "one", "two"),
          connection("blocked", "two", "one"),
        ],
      }),
    ),
    /Duplicate mirrored edge ID/,
  );
  assert.deepEqual(await completeState(t, [canvasId]), baseline);
  assert.equal(
    (await canvasState(t, canvasId)).edges.filter(
      (edge) => edge.edgeId === "inserted-before-error",
    ).length,
    0,
  );
});

test("node removal protects children, removes incident edges, and preserves cascade provenance", async () => {
  const { t, canvasId, userId } = await fixture();
  const parentDataId = await addNodeData(t, canvasId, "title", { text: "parent" });
  const childDataId = await addNodeData(t, canvasId, "title", { text: "child" });
  const otherDataId = await addNodeData(t, canvasId, "title", { text: "other" });
  const nodes = [
    placement("parent", parentDataId),
    placement("child", childDataId, { parentId: "parent", extent: "parent" }),
    placement("other", otherDataId),
  ];
  const edges = [
    connection("parent-child", "parent", "child"),
    connection("child-other", "child", "other"),
    connection("parent-other", "parent", "other"),
  ];
  await seedGraph(t, canvasId, nodes, edges, { revision: 8 });

  const baseline = await completeState(t, [canvasId]);
  await assert.rejects(
    t.mutation((ctx) =>
      CanvasNodeModels.removeCanvasNodes(ctx, {
        authUserId: userId,
        canvasId,
        nodeCanvasIds: ["parent"],
      }),
    ),
    /Cannot remove parent parent without child child/,
  );
  assert.deepEqual(await completeState(t, [canvasId]), baseline);

  await t.mutation((ctx) =>
    CanvasNodeModels.removeCanvasNodes(ctx, {
      authUserId: userId,
      canvasId,
      nodeCanvasIds: ["child"],
    }),
  );
  const state = await canvasState(t, canvasId);
  assert.deepEqual(
    state.canvas.nodes.map((node) => node.id),
    ["parent", "other"],
  );
  assert.deepEqual(
    state.canvas.edges.map((edge) => edge.id),
    ["parent-other"],
  );
  assert.deepEqual(sortedIds(state.nodes, "nodeId"), ["other", "parent"]);
  assert.deepEqual(sortedIds(state.edges, "edgeId"), ["parent-other"]);
  assert.equal(state.canvas.nodeCount, 2);
  assert.equal(state.canvas.graphRevision, 9);

  const pending = await t.run((ctx) =>
    ctx.db.system
      .query("_scheduled_functions")
      .filter((q) => q.eq(q.field("state.kind"), "pending"))
      .take(10),
  );
  assert.equal(pending.length, 1);
  assert.match(pending[0].name, /nodeDataWrappers.*deleteWithCascade/);
  assert.deepEqual(pending[0].args, [
    {
      nodeDataId: childDataId,
      canvasId,
      actor: { type: "user", userId },
    },
  ]);

  await t.finishAllScheduledFunctions(() => vi.runAllTimers(), 100);
  assert.equal(await t.run((ctx) => ctx.db.get(childDataId)), null);
  const versions = await t.run((ctx) =>
    ctx.db
      .query("nodeDataVersions")
      .withIndex("by_nodeDataId", (q) => q.eq("nodeDataId", childDataId))
      .take(10),
  );
  assert.equal(versions.length, 1);
  assert.equal(versions[0].canvasId, canvasId);
  assert.equal(versions[0].trigger, "delete");
  assert.deepEqual(versions[0].actor, { type: "user", userId });
});

test("move keeps internal edges, drops crossing edges, and moves content, chunks, mirrors, and counts", async () => {
  const { t, canvasId, targetCanvasId } = await fixture();
  const parentDataId = await addNodeData(t, canvasId, "title", { text: "parent" });
  const childDataId = await addNodeData(t, canvasId, "title", { text: "child" });
  const sourceNodes = [
    placement("parent", parentDataId),
    placement("child", childDataId, { parentId: "parent", extent: "parent" }),
    placement("stay-a", undefined),
    placement("stay-b", undefined),
  ];
  const sourceEdges = [
    connection("internal", "parent", "child", { data: { relation: "kept" } }),
    connection("crossing", "child", "stay-a"),
    connection("staying", "stay-a", "stay-b"),
  ];
  const targetNodes = [
    placement("target-a", undefined),
    placement("target-b", undefined),
  ];
  const targetEdges = [connection("target-edge", "target-a", "target-b")];
  await seedGraph(t, canvasId, sourceNodes, sourceEdges, { revision: 6 });
  await seedGraph(t, targetCanvasId, targetNodes, targetEdges, { revision: 10 });
  await t.run(async (ctx) => {
    for (const [nodeDataId, nodeId, order] of [
      [parentDataId, "parent", 0],
      [childDataId, "child", 1],
    ]) {
      await ctx.db.insert("searchableChunks", {
        nodeDataId,
        canvasId,
        nodeId,
        nodeType: "title",
        chunkType: "node",
        text: nodeId,
        order,
      });
    }
  });

  assert.equal(
    await t.mutation((ctx) =>
      CanvasNodeModels.moveToCanvas(ctx, {
        sourceCanvasId: canvasId,
        targetCanvasId,
        nodeCanvasIds: ["parent", "child"],
      }),
    ),
    true,
  );

  const source = await canvasState(t, canvasId);
  const target = await canvasState(t, targetCanvasId);
  assert.deepEqual(source.canvas.nodes.map((node) => node.id), ["stay-a", "stay-b"]);
  assert.deepEqual(source.canvas.edges.map((edge) => edge.id), ["staying"]);
  assert.equal(source.canvas.nodeCount, 2);
  assert.equal(source.canvas.graphRevision, 7);
  assert.deepEqual(sortedIds(source.nodes, "nodeId"), ["stay-a", "stay-b"]);
  assert.deepEqual(sortedIds(source.edges, "edgeId"), ["staying"]);

  assert.deepEqual(target.canvas.nodes.map((node) => node.id), [
    "target-a",
    "target-b",
    "parent",
    "child",
  ]);
  assert.deepEqual(target.canvas.edges.map((edge) => edge.id), [
    "target-edge",
    "internal",
  ]);
  assert.equal(
    target.canvas.nodes.find((node) => node.id === "child").parentId,
    "parent",
  );
  assert.equal(target.canvas.nodeCount, 4);
  assert.equal(target.canvas.graphRevision, 11);
  assert.deepEqual(sortedIds(target.nodes, "nodeId"), [
    "child",
    "parent",
    "target-a",
    "target-b",
  ]);
  assert.deepEqual(sortedIds(target.edges, "edgeId"), ["internal", "target-edge"]);
  assert.deepEqual(
    withoutSystemFields(
      target.edges.find((edge) => edge.edgeId === "internal"),
    ).data,
    { relation: "kept" },
  );

  const moved = await t.run(async (ctx) => ({
    parentData: await ctx.db.get(parentDataId),
    childData: await ctx.db.get(childDataId),
    chunks: await ctx.db.query("searchableChunks").take(10),
    crossingMirrors: await ctx.db
      .query("edges")
      .withIndex("by_canvasId_and_edgeId", (q) =>
        q.eq("canvasId", canvasId).eq("edgeId", "crossing"),
      )
      .take(2),
  }));
  assert.equal(moved.parentData.canvasId, targetCanvasId);
  assert.equal(moved.childData.canvasId, targetCanvasId);
  assert.ok(moved.chunks.every((chunk) => chunk.canvasId === targetCanvasId));
  assert.equal(moved.crossingMirrors.length, 0);
  assert.equal(
    target.canvas.edges.some((edge) => edge.id === "crossing"),
    false,
  );
});

test("move rejects node and edge collisions plus split parent selections without partial writes", async () => {
  const { t, canvasId, targetCanvasId } = await fixture();
  const sourceNodes = [
    placement("parent", undefined),
    placement("child", undefined, { parentId: "parent", extent: "parent" }),
    placement("collision", undefined),
    placement("edge-a", undefined),
    placement("edge-b", undefined),
  ];
  const targetNodes = [
    placement("collision", undefined),
    placement("target-a", undefined),
    placement("target-b", undefined),
  ];
  await seedGraph(
    t,
    canvasId,
    sourceNodes,
    [connection("shared-edge", "edge-a", "edge-b")],
    { revision: 12 },
  );
  await seedGraph(
    t,
    targetCanvasId,
    targetNodes,
    [connection("shared-edge", "target-a", "target-b")],
    { revision: 21 },
  );
  const baseline = await completeState(t, [canvasId, targetCanvasId]);
  const cases = [
    { selection: ["child"], error: /without its parent/ },
    { selection: ["parent"], error: /parent parent without child child/ },
    { selection: ["collision"], error: /already contains node collision/ },
    { selection: ["edge-a", "edge-b"], error: /already contains edge shared-edge/ },
  ];

  for (const candidate of cases) {
    await assert.rejects(
      t.mutation((ctx) =>
        CanvasNodeModels.moveToCanvas(ctx, {
          sourceCanvasId: canvasId,
          targetCanvasId,
          nodeCanvasIds: candidate.selection,
        }),
      ),
      candidate.error,
    );
    assert.deepEqual(
      await completeState(t, [canvasId, targetCanvasId]),
      baseline,
    );
  }
});
