/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "../../_generated/api";
import schema from "../../schema";
import { modules } from "../../test.setup";
import type { ToolRunCtx } from "../runtime";
import { canvasScope, type ToolScope } from "../scope";
import { listNodes, type ListNodesFilters } from "./listNodes";

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

  const runCtx = {
    runQuery: t.query,
    runMutation: t.mutation,
    runAction: t.action,
  } as unknown as ToolRunCtx;
  const list = (scope: ToolScope, filters: ListNodesFilters = {}) =>
    listNodes(runCtx, scope, filters);

  return {
    list,
    scope: canvasScope({ userId, canvasId }),
    ids: { frame, child, a, b, c },
    t,
    canvasId,
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
    ).toEqual(
      expect.arrayContaining([
        { id: ids.a, edgeLabels: ["feeds"] },
        { id: ids.c, edgeLabels: [] },
      ]),
    );
    expect(result.nodes).toHaveLength(2);
  });

  test("le contenu modifié le plus récemment d'abord", async () => {
    const { list, scope, ids, t } = await setup();
    // Dates explicites : des nodes créés dans la même milliseconde seraient
    // à égalité.
    const stamp = async (nodeId: string, updatedAt: number) =>
      t.run(async (ctx) => {
        const node = await ctx.db
          .query("nodes")
          .withIndex("by_llmid", (q) => q.eq("id", nodeId))
          .unique();
        await ctx.db.patch(node!.nodeDataId, { updatedAt });
      });
    await stamp(ids.a, 1000);
    await stamp(ids.b, 3000);
    await stamp(ids.c, 2000);
    const result = await list(scope, { types: ["blocknote"] });
    if (!result.ok) throw new Error(result.error);
    expect(
      result.nodes
        .filter((node) => [ids.a, ids.b, ids.c].includes(node.id))
        .map((node) => [node.id, node.updatedAt]),
    ).toEqual([
      [ids.b, 3000],
      [ids.c, 2000],
      [ids.a, 1000],
    ]);
  });

  test("une frame ou une référence inconnue est une erreur", async () => {
    const { list, scope } = await setup();
    expect(await list(scope, { frameId: "nope" })).toEqual({
      ok: false,
      error: 'Frame "nope" not found on canvas',
    });
    expect(
      await list(scope, { linkedTo: { nodeId: "nope", direction: "both" } }),
    ).toEqual({ ok: false, error: 'Node "nope" not found on canvas' });
  });

  test("titres trimés, couleur relisible", async () => {
    const { list, scope, t, canvasId } = await setup();
    const [link] = await t.mutation(
      internal.wrappers.nodeWrappers.createWithNodeData,
      {
        nodes: [
          {
            node: {
              canvasId,
              type: "link",
              position: { x: 0, y: 900 },
              width: 100,
              height: 100,
              color: "blue",
            },
            nodeDataValues: {
              link: { href: "https://x.test", pageTitle: "Connecté au node bleu\n" },
            },
          },
        ],
      },
    );
    const result = await list(scope, { types: ["link"] });
    if (!result.ok) throw new Error(result.error);
    expect(result.nodes).toMatchObject([
      { id: link.nodeId, title: "Connecté au node bleu", color: "blue" },
    ]);
  });

  describe("scope", () => {
    test("un node hors du scope de lecture n'est pas listé", async () => {
      const { list, scope, ids } = await setup();
      const result = await list({ ...scope, read: [ids.a, ids.b] });
      if (!result.ok) throw new Error(result.error);
      expect(result.nodes.map((node) => node.id).sort()).toEqual(
        [ids.a, ids.b].sort(),
      );
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
