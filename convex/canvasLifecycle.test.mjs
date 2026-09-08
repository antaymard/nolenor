// Run with Vitest's edge-runtime environment. Only external actions are
// stubbed; mutations use the actual schema and enforce transaction limits.
import assert from "node:assert/strict";
import { afterEach, beforeEach, test, vi } from "vitest";
import { convexTest } from "convex-test";
import { v } from "convex/values";
import schema from "./schema.ts";
import * as server from "./_generated/server.js";
import { internal } from "./_generated/api.js";
import * as cleanup from "./canvasGraphCleanup.ts";
import * as wrappers from "./wrappers/nodeDataWrappers.ts";
import * as canvases from "./models/canvasModels.ts";
import * as data from "./models/nodeDataModels.ts";
import * as chunks from "./models/searchableChunkModels.ts";
import * as memories from "./models/memoryModels.ts";
import * as onboarding from "./models/onboardingModels.ts";
import { getCanvasAccess, requireCanvasAccess } from "./lib/auth.ts";

const deletedKeys = [];
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
const modules = {
  ...import.meta.glob("./**/*.{js,ts}"),
  "./_generated/server.js": async () => server,
  "./canvasGraphCleanup.ts": async () => cleanup,
  "./wrappers/nodeDataWrappers.ts": async () => wrappers,
  "./uploads.ts": async () => ({
    deleteR2Files: server.internalAction({
      args: { keys: v.array(v.string()) },
      returns: v.null(),
      handler: async (_ctx, { keys }) => {
        deletedKeys.push(...keys);
        return null;
      },
    }),
  }),
  "./searchable/chunkBuilder.ts": async () => ({
    rebuildChunksBatch: server.internalAction({
      args: { nodeDataIds: v.array(v.id("nodeDatas")) },
      returns: v.null(),
      handler: async () => null,
    }),
  }),
};

function placement(nodeDataId, id = "node") {
  return {
    id,
    nodeDataId,
    type: "title",
    position: { x: 0, y: 0 },
    width: 200,
    height: 100,
  };
}

function chunk(nodeDataId, canvasId, nodeId = "node", order = 0) {
  return {
    nodeDataId,
    canvasId,
    nodeId,
    order,
    nodeType: "title",
    chunkType: "node",
    text: "current",
  };
}

async function fixture() {
  const t = convexTest({ schema, modules, transactionLimits: true });
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {});
    const foreignUserId = await ctx.db.insert("users", {});
    const canvasId = await ctx.db.insert("canvases", {
      creatorId: userId,
      name: "own",
      nodes: [],
      edges: [],
      updatedAt: 0,
    });
    const foreignCanvasId = await ctx.db.insert("canvases", {
      creatorId: foreignUserId,
      name: "foreign",
      nodes: [],
      edges: [],
      updatedAt: 0,
    });
    const nodeDataId = await ctx.db.insert("nodeDatas", {
      canvasId,
      type: "title",
      values: { text: "keep" },
      updatedAt: 0,
    });
    const foreignDataId = await ctx.db.insert("nodeDatas", {
      canvasId: foreignCanvasId,
      type: "title",
      values: { text: "foreign" },
      updatedAt: 0,
    });
    await ctx.db.patch("canvases", canvasId, {
      nodes: [placement(nodeDataId)],
    });
    await ctx.db.patch("canvases", foreignCanvasId, {
      nodes: [placement(foreignDataId)],
    });
    return {
      userId,
      foreignUserId,
      canvasId,
      foreignCanvasId,
      nodeDataId,
      foreignDataId,
    };
  });
  return { t, ...ids };
}

async function rows(t, table) {
  return t.run((ctx) => ctx.db.query(table).take(1000));
}

test("new canvas starts with an empty certified graph", async () => {
  const { t, userId } = await fixture();
  const id = await t.mutation((ctx) =>
    canvases.createCanvasForUser(ctx, { authUserId: userId, name: "new" }),
  );
  const canvas = await t.run((ctx) => ctx.db.get(id));
  assert.equal(canvas.nodeCount, 0);
  assert.equal(canvas.graphRevision, 0);
  assert.equal(canvas.graphMigrated, true);
  assert.deepEqual(canvas.nodes, []);
  assert.deepEqual(canvas.edges, []);
});

test("root deletion rolls back if scheduling fails", async () => {
  const { t, canvasId } = await fixture();
  await assert.rejects(
    t.mutation((ctx) =>
      canvases.deleteCanvasAndShares(
        {
          ...ctx,
          scheduler: {
            ...ctx.scheduler,
            runAfter: async () => {
              throw new Error("scheduler unavailable");
            },
          },
        },
        { canvasId },
      ),
    ),
    /scheduler unavailable/,
  );
  assert.ok(await t.run((ctx) => ctx.db.get(canvasId)));
});

test("old cascade jobs protect reattachments, fallback and ambiguous references", async () => {
  const { t, canvasId, nodeDataId, foreignDataId } = await fixture();
  for (const node of [
    placement(nodeDataId, "reattached"),
    { ...placement(undefined, "fallback"), data: { nodeDataId } },
    { ...placement(foreignDataId, "conflict"), data: { nodeDataId } },
  ]) {
    await t.run((ctx) => ctx.db.patch("canvases", canvasId, { nodes: [node] }));
    await t.mutation(internal.wrappers.nodeDataWrappers.deleteWithCascade, {
      nodeDataId,
      canvasId,
    });
    await t.mutation(internal.wrappers.nodeDataWrappers.deleteWithCascade, {
      nodeDataId,
    });
    assert.ok(await t.run((ctx) => ctx.db.get(nodeDataId)));
  }
  assert.equal((await rows(t, "nodeDataVersions")).length, 0);
  assert.equal(
    (await t.run((ctx) => ctx.db.system.query("_scheduled_functions").take(10)))
      .length,
    0,
  );
});

test("cascade rejects foreign provenance and checkpoints detached content only once", async () => {
  const { t, canvasId, nodeDataId, foreignCanvasId, userId } = await fixture();
  const actor = { type: "agent", userId, threadId: "deletion-thread" };
  const threadId = await t.run((ctx) => ctx.db.insert("threadMetadata", {
    threadId: actor.threadId, userId, canvasId, agentName: "Worker", totalUsageUsd: 0,
  }));
  await t.run((ctx) => ctx.db.patch("canvases", canvasId, { nodes: [] }));
  for (const args of [
    { nodeDataId },
    { nodeDataId, canvasId: foreignCanvasId },
  ]) {
    assert.equal(
      await t.mutation((ctx) => data.deleteNodeDataWithCascade(ctx, { ...args, actor })),
      false,
    );
    assert.ok(await t.run((ctx) => ctx.db.get(nodeDataId)));
    assert.equal((await t.run((ctx) => ctx.db.get(threadId))).touchedNodes, undefined);
  }
  assert.equal(
    await t.mutation((ctx) =>
      data.deleteNodeDataWithCascade(ctx, { nodeDataId, canvasId, actor }),
    ),
    true,
  );
  await t.mutation((ctx) =>
    data.deleteNodeDataWithCascade(ctx, { nodeDataId, canvasId, actor }),
  );
  await t.finishAllScheduledFunctions(vi.runAllTimers, 1000);
  assert.equal(await t.run((ctx) => ctx.db.get(nodeDataId)), null);
  assert.equal((await rows(t, "nodeDataVersions")).length, 1);
  assert.deepEqual((await rows(t, "nodeDataVersions"))[0].actor, actor);
  const touches = (await t.run((ctx) => ctx.db.get(threadId))).touchedNodes;
  assert.equal(touches.length, 1);
  assert.equal(touches[0].nodeDataId, nodeDataId);
  assert.equal(touches[0].kind, "deleted");
});

test("parent-absent writers reject or no-op before recreating descendants", async () => {
  const { t, canvasId, nodeDataId } = await fixture();
  await t.run((ctx) => ctx.db.delete(canvasId));
  for (const write of [
    (ctx) => data.createNodeData(ctx, { canvasId, type: "title", values: {} }),
    (ctx) =>
      data.updateValues(ctx, {
        _id: nodeDataId,
        values: { text: "keep" },
        actor: { type: "system" },
      }),
    (ctx) => data.setImageGeneration(ctx, { nodeDataId, status: "running" }),
    (ctx) => data.clearImageGeneration(ctx, { nodeDataId }),
    (ctx) =>
      memories.upsert(ctx, {
        subjectType: "nodeData",
        subjectId: nodeDataId,
        type: "memory",
        content: "late",
      }),
    (ctx) =>
      memories.upsert(ctx, {
        subjectType: "canvas",
        subjectId: canvasId,
        type: "memory",
        content: "late",
      }),
  ])
    await assert.rejects(t.mutation(write));
  await t.mutation((ctx) =>
    chunks.upsertChunks(ctx, {
      nodeDataId,
      chunks: [chunk(nodeDataId, canvasId)],
    }),
  );
  assert.equal((await rows(t, "memories")).length, 0);
  assert.equal((await rows(t, "searchableChunks")).length, 0);
});

test("chunk snapshots cannot overwrite current placement with stale or mixed identities", async () => {
  const { t, canvasId, nodeDataId, foreignCanvasId, foreignDataId } =
    await fixture();
  const current = chunk(nodeDataId, canvasId);
  await t.mutation((ctx) =>
    chunks.upsertChunks(ctx, { nodeDataId, chunks: [current] }),
  );
  for (const incoming of [
    [],
    [chunk(nodeDataId, foreignCanvasId)],
    [chunk(nodeDataId, canvasId, "old")],
    [current, chunk(foreignDataId, canvasId)],
  ]) {
    await t.mutation((ctx) =>
      chunks.upsertChunks(ctx, { nodeDataId, chunks: incoming }),
    );
    const saved = await rows(t, "searchableChunks");
    assert.equal(saved.length, 1);
    assert.equal(saved[0].canvasId, canvasId);
    assert.equal(saved[0].nodeId, "node");
  }
  await t.run((ctx) =>
    ctx.db.patch(canvasId, {
      nodes: [placement(nodeDataId), placement(nodeDataId, "duplicate")],
    }),
  );
  await assert.rejects(
    t.mutation((ctx) =>
      chunks.upsertChunks(ctx, { nodeDataId, chunks: [current] }),
    ),
    /Ambiguous/,
  );
});

test("chunk move overflow rolls back the caller's earlier writes", async () => {
  const { t, canvasId, nodeDataId, foreignCanvasId } = await fixture();
  await t.run(async (ctx) => {
    for (let i = 0; i <= chunks.MAX_CHUNKS_PER_NODE_DATA; i++)
      await ctx.db.insert(
        "searchableChunks",
        chunk(nodeDataId, canvasId, "node", i),
      );
  });
  await assert.rejects(
    t.mutation(async (ctx) => {
      await ctx.db.patch(nodeDataId, { canvasId: foreignCanvasId });
      await ctx.db.patch(canvasId, { name: "should roll back" });
      await chunks.updateCanvasId(ctx, {
        nodeDataId,
        canvasId: foreignCanvasId,
      });
    }),
    /Too many searchable chunks/,
  );
  assert.equal(
    (await t.run((ctx) => ctx.db.get(nodeDataId))).canvasId,
    canvasId,
  );
  assert.equal((await t.run((ctx) => ctx.db.get(canvasId))).name, "own");
  assert.ok(
    (await rows(t, "searchableChunks")).every(
      (row) => row.canvasId === canvasId,
    ),
  );
});

test("chunk move byte budget rejects a few oversized chunks atomically", async () => {
  const { t, canvasId, nodeDataId, foreignCanvasId } = await fixture();
  await t.run(async (ctx) => {
    for (let i = 0; i < 3; i++)
      await ctx.db.insert("searchableChunks", {
        ...chunk(nodeDataId, canvasId, "node", i),
        text: "x".repeat(800_000),
      });
  });
  await assert.rejects(
    t.mutation(async (ctx) => {
      await ctx.db.patch(nodeDataId, { canvasId: foreignCanvasId });
      await chunks.updateCanvasId(ctx, {
        nodeDataId,
        canvasId: foreignCanvasId,
      });
    }),
    /byte budget/,
  );
  assert.equal(
    (await t.run((ctx) => ctx.db.get(nodeDataId))).canvasId,
    canvasId,
  );
});

test("dependency purge handles large fan-out, shared refs and retries without a parent", async () => {
  deletedKeys.length = 0;
  const { t, canvasId, nodeDataId, foreignDataId } = await fixture();
  await t.run(async (ctx) => {
    for (let i = 0; i <= chunks.MAX_CHUNKS_PER_NODE_DATA; i++) {
      await ctx.db.insert(
        "searchableChunks",
        chunk(nodeDataId, canvasId, "node", i),
      );
    }
    for (let i = 0; i < cleanup.CLEANUP_BATCH_SIZE + 3; i++) {
      await ctx.db.insert("memories", {
        subjectId: nodeDataId,
        subjectType: "nodeData",
        type: "memory",
        content: "x".repeat(100_000),
        updatedAt: 0,
      });
    }
    await ctx.db.insert("r2Objects", { nodeDataId, key: "shared" });
    await ctx.db.insert("r2Objects", {
      nodeDataId: foreignDataId,
      key: "shared",
    });
    await ctx.db.insert("r2Objects", { nodeDataId, key: "last-reference" });
    await ctx.db.delete(canvasId);
  });
  await t.mutation(internal.wrappers.nodeDataWrappers.deleteWithCascade, {
    nodeDataId,
  });
  await t.finishAllScheduledFunctions(vi.runAllTimers, 1000);
  await t.mutation(internal.canvasGraphCleanup.purgeNodeData, { nodeDataId });
  await t.finishAllScheduledFunctions(vi.runAllTimers, 1000);
  for (const table of ["searchableChunks", "memories"])
    assert.equal((await rows(t, table)).length, 0);
  assert.equal((await rows(t, "nodeDataVersions")).length, 1);
  assert.equal((await rows(t, "r2Objects")).length, 1);
  assert.deepEqual(deletedKeys, ["last-reference"]);
  assert.ok(await t.run((ctx) => ctx.db.get(foreignDataId)));
});

test("foreign templates require an accessible valid canvas instance", async () => {
  const { t, canvasId, foreignUserId } = await fixture();
  const templateId = await t.run((ctx) =>
    ctx.db.insert("nodeTemplates", {
      creatorId: foreignUserId,
      name: "private",
      fields: [],
      nodeLayout: {},
      defaultDimensions: { width: 100, height: 100 },
      updatedAt: 0,
    }),
  );
  await assert.rejects(
    t.mutation((ctx) =>
      data.createNodeData(ctx, {
        canvasId,
        type: "custom",
        templateId,
        values: {},
      }),
    ),
    /not accessible/,
  );
  await t.run(async (ctx) => {
    const nodeDataId = await ctx.db.insert("nodeDatas", {
      canvasId,
      type: "custom",
      templateId,
      values: {},
      updatedAt: 0,
    });
    await ctx.db.patch(canvasId, {
      nodes: [{ ...placement(nodeDataId), type: "custom" }],
    });
  });
  assert.ok(
    await t.mutation((ctx) =>
      data.createNodeData(ctx, {
        canvasId,
        type: "custom",
        templateId,
        values: {},
      }),
    ),
  );
});

test("onboarding rejects foreign fallback or budget overflow without partial clones", async () => {
  const { t, userId, foreignCanvasId, nodeDataId } = await fixture();
  const previous = process.env.STARTER_CANVAS_IDS;
  process.env.STARTER_CANVAS_IDS = foreignCanvasId;
  try {
    await t.run((ctx) =>
      ctx.db.patch(foreignCanvasId, {
        nodes: [{ ...placement(undefined), data: { nodeDataId } }],
      }),
    );
    await assert.rejects(
      t.mutation((ctx) =>
        onboarding.provisionStarterCanvasesForUser(ctx, { authUserId: userId }),
      ),
      /Invalid nodeData reference/,
    );
    await t.run((ctx) =>
      ctx.db.patch(foreignCanvasId, {
        nodes: Array.from(
          { length: onboarding.STARTER_CLONE_LIMITS.nodes + 1 },
          (_, i) => placement(undefined, `n${i}`),
        ),
      }),
    );
    await assert.rejects(
      t.mutation((ctx) =>
        onboarding.provisionStarterCanvasesForUser(ctx, { authUserId: userId }),
      ),
      /budget exceeded/,
    );
    assert.equal((await rows(t, "canvases")).length, 2);
    assert.equal((await rows(t, "nodeDatas")).length, 2);
  } finally {
    if (previous === undefined) delete process.env.STARTER_CANVAS_IDS;
    else process.env.STARTER_CANVAS_IDS = previous;
  }
});

test("onboarding normalizes fallback before remap and dual-writes cloned edges", async () => {
  const { t, userId, foreignCanvasId, foreignDataId } = await fixture();
  const previous = process.env.STARTER_CANVAS_IDS;
  process.env.STARTER_CANVAS_IDS = foreignCanvasId;
  try {
    await t.run((ctx) =>
      ctx.db.patch(foreignCanvasId, {
        nodes: [
          {
            ...placement(undefined),
            data: { nodeDataId: foreignDataId, label: "preserved" },
          },
          placement(undefined, "second"),
        ],
        edges: [{ id: "edge", source: "node", target: "second" }],
      }),
    );
    const [id] = await t.mutation((ctx) =>
      onboarding.provisionStarterCanvasesForUser(ctx, { authUserId: userId }),
    );
    const clone = await t.run((ctx) => ctx.db.get(id));
    assert.notEqual(clone.nodes[0].nodeDataId, foreignDataId);
    assert.equal(clone.nodes[0].data.nodeDataId, undefined);
    assert.equal(clone.nodes[0].data.label, "preserved");
    assert.equal(clone.nodeCount, 2);
    assert.equal(
      (await rows(t, "nodes")).filter((n) => n.canvasId === id).length,
      2,
    );
    assert.equal(
      (await rows(t, "edges")).filter((e) => e.canvasId === id).length,
      1,
    );
    await t.finishAllScheduledFunctions(vi.runAllTimers, 1000);
  } finally {
    if (previous === undefined) delete process.env.STARTER_CANVAS_IDS;
    else process.env.STARTER_CANVAS_IDS = previous;
  }
});

test("deletedAt guards reject access and internal writes without activating soft-delete", async () => {
  const { t, canvasId, nodeDataId, userId } = await fixture();
  await t.run((ctx) =>
    ctx.db.patch(canvasId, { deletedAt: 0, isPublic: true }),
  );
  assert.equal(
    await t.run((ctx) => getCanvasAccess(ctx, canvasId, userId)),
    null,
  );
  await assert.rejects(
    t.run((ctx) =>
      requireCanvasAccess(ctx, canvasId, null, "viewer", { allowPublic: true }),
    ),
  );
  await assert.rejects(
    t.mutation((ctx) =>
      data.updateValues(ctx, {
        _id: nodeDataId,
        values: {},
        actor: { type: "system" },
      }),
    ),
  );
});

test("parent-absent purge drains bounded batches and keeps foreign content and shared R2 refs", async () => {
  deletedKeys.length = 0;
  const { t, canvasId, nodeDataId, foreignDataId, userId, foreignUserId } =
    await fixture();
  await t.run(async (ctx) => {
    for (let i = 0; i < cleanup.CLEANUP_BATCH_SIZE + 3; i++) {
      await ctx.db.insert("nodes", {
        canvasId,
        nodeId: `n${i}`,
        nodeDataId: foreignDataId,
        type: "title",
        position: { x: 0, y: 0 },
        width: 1,
        height: 1,
      });
      await ctx.db.insert("edges", {
        canvasId,
        edgeId: `e${i}`,
        source: "n0",
        target: "n1",
      });
      await ctx.db.insert(
        "searchableChunks",
        chunk(nodeDataId, canvasId, "node", i),
      );
      await ctx.db.insert("memories", {
        subjectId: nodeDataId,
        subjectType: "nodeData",
        type: "memory",
        content: "remove",
        updatedAt: 0,
      });
      await ctx.db.insert("shares", {
        resourceType: "canvas",
        canvasId,
        userId: foreignUserId,
        grantedBy: userId,
        permission: "viewer",
      });
    }
    await ctx.db.insert("r2Objects", { nodeDataId, key: "shared" });
    await ctx.db.insert("r2Objects", {
      nodeDataId: foreignDataId,
      key: "shared",
    });
    await ctx.db.insert("r2Objects", { nodeDataId, key: "last-reference" });
  });
  await t.mutation((ctx) => canvases.deleteCanvasAndShares(ctx, { canvasId }));
  assert.equal(await t.run((ctx) => ctx.db.get(canvasId)), null);
  await t.finishAllScheduledFunctions(vi.runAllTimers, 1000);
  await t.mutation(internal.canvasGraphCleanup.purgeCanvas, { canvasId });
  await t.mutation(internal.canvasGraphCleanup.purgeNodeData, { nodeDataId });
  await t.finishAllScheduledFunctions(vi.runAllTimers, 1000);
  for (const table of [
    "nodes",
    "edges",
    "shares",
    "searchableChunks",
    "memories",
  ])
    assert.equal((await rows(t, table)).length, 0);
  assert.ok(await t.run((ctx) => ctx.db.get(foreignDataId)));
  assert.equal((await rows(t, "nodeDataVersions")).length, 1);
  assert.deepEqual(deletedKeys, ["last-reference"]);
  assert.equal((await rows(t, "r2Objects")).length, 1);
});
