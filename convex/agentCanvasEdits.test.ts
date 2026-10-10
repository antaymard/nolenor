/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { modules } from "./test.setup";

type Shape = {
  type: "blocknote" | "link" | "frame";
  x: number;
  y: number;
  locked?: boolean;
};

async function setup(shapes: Shape[]) {
  const t = convexTest(schema, modules);
  const canvasId = await t.run(async (ctx) => {
    const owner = await ctx.db.insert("users", {});
    return ctx.db.insert("canvases", {
      creatorId: owner,
      name: "Canvas",
      updatedAt: Date.now(),
      isPublic: false,
    });
  });
  const created = await t.mutation(
    internal.wrappers.nodeWrappers.createWithNodeData,
    {
      nodes: shapes.map((shape) => ({
        node: {
          canvasId,
          type: shape.type,
          position: { x: shape.x, y: shape.y },
          width: 100,
          height: 100,
          ...(shape.locked && { locked: true }),
        },
        nodeDataValues: {},
      })),
    },
  );
  return { t, canvasId, ids: created.map((node) => node.nodeId) };
}

async function readNode(t: TestConvex<typeof schema>, nodeId: string) {
  return t.run((ctx) =>
    ctx.db
      .query("nodes")
      .withIndex("by_llmid", (q) => q.eq("id", nodeId))
      .unique(),
  );
}

async function connect(
  t: TestConvex<typeof schema>,
  canvasId: Id<"canvases">,
  source: string,
  target: string,
) {
  const [edgeId] = await t.mutation(internal.wrappers.edgeWrappers.create, {
    edges: [{ canvasId, source, target }],
  });
  return edgeId;
}

describe("nodeWrappers.trashFromAgent", () => {
  test("met nodes et connexions à la corbeille, avec une seule date", async () => {
    const { t, canvasId, ids } = await setup([
      { type: "blocknote", x: 0, y: 0 },
      { type: "blocknote", x: 300, y: 0 },
      { type: "blocknote", x: 600, y: 0 },
    ]);
    const [a, b, c] = ids;
    const ab = await connect(t, canvasId, a, b);
    const bc = await connect(t, canvasId, b, c);

    await t.mutation(internal.wrappers.nodeWrappers.trashFromAgent, {
      canvasId,
      nodeIds: [a],
      edgeIds: [bc],
    });

    const nodeA = await readNode(t, a);
    const nodeB = await readNode(t, b);
    expect(nodeA?.status).toBe("trashed");
    expect(nodeB?.status).toBeUndefined();
    const edges = await t.run((ctx) =>
      ctx.db
        .query("edges")
        .withIndex("by_canvas", (q) => q.eq("canvasId", canvasId))
        .collect(),
    );
    const byId = new Map(edges.map((edge) => [edge.id, edge]));
    expect(byId.get(ab)?.status).toBe("trashed");
    expect(byId.get(bc)?.status).toBe("trashed");
    expect(byId.get(ab)?.trashedAt).toBe(nodeA?.trashedAt);
    expect(byId.get(bc)?.trashedAt).toBe(nodeA?.trashedAt);
  });

  test("rien n'est écrit si un id est inconnu", async () => {
    const { t, canvasId, ids } = await setup([
      { type: "blocknote", x: 0, y: 0 },
    ]);
    await expect(
      t.mutation(internal.wrappers.nodeWrappers.trashFromAgent, {
        canvasId,
        nodeIds: [ids[0], "nope"],
        edgeIds: [],
      }),
    ).rejects.toThrow(/nope/);
    expect((await readNode(t, ids[0]))?.status).toBeUndefined();
  });
});

describe("nodeWrappers.updateLayout", () => {
  test("variante : dimensions par défaut, couleur, position", async () => {
    const { t, canvasId, ids } = await setup([
      { type: "link", x: 0, y: 0 },
    ]);
    const [result] = await t.mutation(
      internal.wrappers.nodeWrappers.updateLayout,
      {
        canvasId,
        updates: [
          {
            nodeId: ids[0],
            variant: "preview",
            color: "blue",
            position: { x: 40, y: 50 },
          },
        ],
      },
    );
    expect(result).toMatchObject({
      position: { x: 40, y: 50 },
      width: 352,
      height: 132,
      color: "blue",
      variant: "preview",
    });
  });

  test("variante inconnue : refus, rien d'écrit", async () => {
    const { t, canvasId, ids } = await setup([
      { type: "link", x: 0, y: 0 },
    ]);
    await expect(
      t.mutation(internal.wrappers.nodeWrappers.updateLayout, {
        canvasId,
        updates: [
          { nodeId: ids[0], color: "red" },
          { nodeId: ids[0], variant: "grid" },
        ],
      }),
    ).rejects.toThrow(/twice/);
    await expect(
      t.mutation(internal.wrappers.nodeWrappers.updateLayout, {
        canvasId,
        updates: [{ nodeId: ids[0], color: "red", variant: "grid" }],
      }),
    ).rejects.toThrow(/no variant "grid"/);
    expect((await readNode(t, ids[0]))?.color).toBeUndefined();
  });

  test("un node verrouillé ne bouge pas", async () => {
    const { t, canvasId, ids } = await setup([
      { type: "blocknote", x: 0, y: 0, locked: true },
    ]);
    await expect(
      t.mutation(internal.wrappers.nodeWrappers.updateLayout, {
        canvasId,
        updates: [{ nodeId: ids[0], position: { x: 10, y: 10 } }],
      }),
    ).rejects.toThrow(/locked/);
  });

  test("dans une frame : repère converti, frame agrandie, sortie refusée", async () => {
    const { t, canvasId, ids } = await setup([
      { type: "blocknote", x: 0, y: 0 },
      { type: "blocknote", x: 200, y: 0 },
    ]);
    const frame = await t.mutation(
      internal.wrappers.nodeWrappers.createFrameAround,
      { canvasId, nodeIds: ids, values: { title: "F" } },
    );
    // Frame en (-24, -24), 348 × 148.
    const [moved] = await t.mutation(
      internal.wrappers.nodeWrappers.updateLayout,
      {
        canvasId,
        updates: [{ nodeId: ids[0], position: { x: 0, y: 300 } }],
      },
    );
    expect(moved.position).toEqual({ x: 0, y: 300 });
    expect(moved.frameGrown).toEqual({
      frameId: frame.frameId,
      width: 348,
      height: 24 + 300 + 100 + 24,
    });
    expect((await readNode(t, ids[0]))?.position).toEqual({ x: 24, y: 324 });

    await expect(
      t.mutation(internal.wrappers.nodeWrappers.updateLayout, {
        canvasId,
        updates: [{ nodeId: ids[1], position: { x: -100, y: 0 } }],
      }),
    ).rejects.toThrow(/cannot leave its frame/);
  });

  test("frame compactée : premier plan, taille stockée intacte", async () => {
    const { t, canvasId, ids } = await setup([
      { type: "blocknote", x: 0, y: 0 },
      { type: "blocknote", x: 200, y: 0 },
    ]);
    const frame = await t.mutation(
      internal.wrappers.nodeWrappers.createFrameAround,
      { canvasId, nodeIds: ids, values: { title: "F" } },
    );
    const [result] = await t.mutation(
      internal.wrappers.nodeWrappers.updateLayout,
      {
        canvasId,
        updates: [{ nodeId: frame.frameId, variant: "compact" }],
      },
    );
    expect(result).toMatchObject({ width: 348, height: 148 });
    const stored = await readNode(t, frame.frameId);
    expect(stored?.variant).toBe("compact");
    expect(stored?.zIndex).toBeGreaterThan(0);
  });
});
