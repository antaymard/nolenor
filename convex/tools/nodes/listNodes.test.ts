import { describe, expect, test } from "vitest";
import { internal } from "../../_generated/api";
import type { ToolScope } from "../scope";
import { blocknoteDoc, createNode, setupTools } from "../testing.helpers";
import { listNodes, type ListNodesFilters } from "./listNodes";

/** Une frame en (1000, 1000) avec un enfant, et trois notes reliées a → b ← c. */
async function setup() {
  const tools = await setupTools();
  const note = (title: string, x: number, y: number, parentId?: string) =>
    createNode(tools, {
      type: "blocknote",
      x,
      y,
      parentId,
      values: { doc: blocknoteDoc(title) },
    }).then((node) => node.id);

  const frame = (await createNode(tools, { type: "frame", x: 1000, y: 1000 }))
    .id;
  const child = await note("Child", 50, 60, frame);
  const a = await note("A", 0, 0);
  const b = await note("B", 300, 0);
  const c = await note("C", 600, 0);
  await tools.t.mutation(internal.wrappers.edgeWrappers.create, {
    edges: [
      { canvasId: tools.canvasId, source: a, target: b, data: { label: "feeds" } },
      { canvasId: tools.canvasId, source: c, target: b },
    ],
  });

  return {
    ...tools,
    list: (scope: ToolScope, filters: ListNodesFilters = {}) =>
      listNodes(tools.run, scope, filters),
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
    const tools = await setup();
    const link = await createNode(tools, {
      type: "link",
      y: 900,
      color: "blue",
      values: {
        link: { href: "https://x.test", pageTitle: "Connecté au node bleu\n" },
      },
    });
    const result = await tools.list(tools.scope, { types: ["link"] });
    if (!result.ok) throw new Error(result.error);
    expect(result.nodes).toMatchObject([
      { id: link.id, title: "Connecté au node bleu", color: "blue" },
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
