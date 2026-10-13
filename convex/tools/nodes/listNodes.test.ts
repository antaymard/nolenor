/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "../../_generated/api";
import schema from "../../schema";
import { modules } from "../../test.setup";
import { canvasScope, type ToolScope } from "../scope";

const heading = (text: string) =>
  JSON.stringify([
    {
      id: "h",
      type: "heading",
      props: { level: 1 },
      content: [{ type: "text", text, styles: {} }],
      children: [],
    },
  ]);

/** Une frame en (1000, 1000) avec un enfant, et trois notes reliées a → b ← c. */
async function setup() {
  const t = convexTest(schema, modules);
  const { userId, canvasId } = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {});
    const canvasId = await ctx.db.insert("canvases", {
      creatorId: userId,
      name: "Canvas",
      updatedAt: Date.now(),
      isPublic: false,
    });
    return { userId, canvasId };
  });

  const create = async (
    type: "blocknote" | "frame",
    x: number,
    y: number,
    title?: string,
    parentId?: string,
  ) => {
    const [created] = await t.mutation(
      internal.wrappers.nodeWrappers.createWithNodeData,
      {
        nodes: [
          {
            node: {
              canvasId,
              type,
              position: { x, y },
              width: 100,
              height: 100,
              ...(parentId && { parentId }),
            },
            nodeDataValues: title ? { doc: heading(title) } : {},
          },
        ],
      },
    );
    return created.nodeId;
  };

  const frame = await create("frame", 1000, 1000);
  const child = await create("blocknote", 50, 60, "Child", frame);
  const a = await create("blocknote", 0, 0, "A");
  const b = await create("blocknote", 300, 0, "B");
  const c = await create("blocknote", 600, 0, "C");
  await t.mutation(internal.wrappers.edgeWrappers.create, {
    edges: [
      { canvasId, source: a, target: b, data: { label: "feeds" } },
      { canvasId, source: c, target: b },
    ],
  });

  const list = (scope: ToolScope, filters = {}) =>
    t.query(internal.tools.nodes.listNodes.list, { scope, filters });

  return {
    list,
    scope: canvasScope({ userId, canvasId }),
    ids: { frame, child, a, b, c },
  };
}

describe("listNodes", () => {
  test("rend les titres et les positions monde", async () => {
    const { list, scope, ids } = await setup();
    const result = await list(scope, { frameId: ids.frame });
    expect(result).toMatchObject({
      ok: true,
      nodes: [
        { id: ids.child, title: "Child", x: 1050, y: 1060, frameId: ids.frame },
      ],
    });
  });

  test("suit les edges avec leurs labels", async () => {
    const { list, scope, ids } = await setup();
    const result = await list(scope, {
      linkedTo: { nodeId: ids.b, direction: "input" },
    });
    if (!result.ok) throw new Error(result.error);
    expect(
      result.nodes.map(({ id, edgeLabels }) => ({ id, edgeLabels })),
    ).toEqual([
      { id: ids.a, edgeLabels: ["feeds"] },
      { id: ids.c, edgeLabels: [] },
    ]);
  });

  describe("scope", () => {
    test("un node hors du scope de lecture n'est pas listé", async () => {
      const { list, scope, ids } = await setup();
      const result = await list({ ...scope, read: [ids.a, ids.b] });
      if (!result.ok) throw new Error(result.error);
      expect(result.nodes.map((node) => node.id)).toEqual([ids.a, ids.b]);
    });

    test("ni suivi par une edge", async () => {
      const { list, scope, ids } = await setup();
      const result = await list(
        { ...scope, read: [ids.b, ids.c] },
        { linkedTo: { nodeId: ids.b, direction: "input" } },
      );
      if (!result.ok) throw new Error(result.error);
      expect(result.nodes.map((node) => node.id)).toEqual([ids.c]);
    });

    test("ni utilisable comme référence", async () => {
      const { list, scope, ids } = await setup();
      const result = await list(
        { ...scope, read: [ids.b] },
        { near: { nodeId: ids.a } },
      );
      expect(result).toEqual({
        ok: false,
        error: `Reference node "${ids.a}" not found on canvas`,
      });
    });

    test("la frame d'un enfant visible le décale même hors scope", async () => {
      const { list, scope, ids } = await setup();
      const result = await list({ ...scope, read: [ids.child] });
      expect(result).toMatchObject({
        ok: true,
        nodes: [{ id: ids.child, x: 1050, y: 1060 }],
      });
    });
  });
});
