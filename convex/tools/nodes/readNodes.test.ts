/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import prosemirrorSyncTest from "@convex-dev/prosemirror-sync/test";
import { describe, expect, test } from "vitest";
import { internal } from "../../_generated/api";
import debouncerSchema from "../../components/debouncer/schema";
import schema from "../../schema";
import { modules } from "../../test.setup";
import type { ToolRunCtx } from "../runtime";
import { canvasScope, type ToolScope } from "../scope";
import { readNodes } from "./readNodes";

const doc = (title: string, mentionNodeDataId?: string) =>
  JSON.stringify([
    {
      id: "h",
      type: "heading",
      props: { level: 1 },
      content: [{ type: "text", text: title, styles: {} }],
      children: [],
    },
    ...(mentionNodeDataId
      ? [
          {
            id: "p",
            type: "paragraph",
            props: {},
            content: [
              {
                type: "mention",
                props: { nodeDataId: mentionNodeDataId, title: "Old title" },
              },
            ],
            children: [],
          },
        ]
      : []),
  ]);

/**
 * a → b, c → a ; a mentionne b ; une frame avec deux enfants ; un custom
 * node dont le titre vient de son template ; douze liens pour les lots.
 */
async function setup() {
  const t = convexTest(schema, modules);
  prosemirrorSyncTest.register(t);
  t.registerComponent(
    "debouncer",
    debouncerSchema,
    import.meta.glob("../../components/debouncer/**/*.ts"),
  );
  const { userId, canvasId, templateId } = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {});
    const canvasId = await ctx.db.insert("canvases", {
      creatorId: userId,
      name: "Canvas",
      updatedAt: Date.now(),
      isPublic: false,
    });
    const templateId = await ctx.db.insert("nodeTemplates", {
      creatorId: userId,
      name: "Contact",
      fields: [
        { id: "a_note", name: "Note", type: "short_text" },
        { id: "z_name", name: "Name", type: "short_text" },
      ],
      nodeLayout: {},
      titleFieldId: "z_name",
      defaultDimensions: { width: 200, height: 100 },
      updatedAt: 0,
    });
    return { userId, canvasId, templateId };
  });

  const create = async (
    type: "blocknote" | "frame" | "link" | "custom",
    values: Record<string, unknown>,
    position = { x: 0, y: 0 },
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
              position,
              width: 100,
              height: 100,
              ...(parentId && { parentId }),
            },
            nodeDataValues: values,
            ...(type === "custom" && { nodeDataTemplateId: templateId }),
          },
        ],
      },
    );
    const node = await t.run((ctx) =>
      ctx.db
        .query("nodes")
        .withIndex("by_llmid", (q) => q.eq("id", created.nodeId))
        .unique(),
    );
    return { id: created.nodeId, nodeDataId: node!.nodeDataId };
  };

  const b = await create("blocknote", { doc: doc("B") });
  const a = await create("blocknote", { doc: doc("A", b.nodeDataId) });
  const c = await create("blocknote", { doc: doc("C") });
  const frame = await create("frame", { title: "Group" }, { x: 1000, y: 0 });
  const lower = await create(
    "blocknote",
    { doc: doc("Lower") },
    { x: 10, y: 300 },
    frame.id,
  );
  const upper = await create(
    "blocknote",
    { doc: doc("Upper") },
    { x: 10, y: 50 },
    frame.id,
  );
  const custom = await create("custom", {
    a_note: "a note",
    z_name: "Ada Lovelace",
  });
  const links: string[] = [];
  for (let i = 0; i < 12; i++) {
    links.push(
      (await create("link", { link: { href: `https://l${i}.test` } })).id,
    );
  }
  await t.mutation(internal.wrappers.edgeWrappers.create, {
    edges: [
      { canvasId, source: a.id, target: b.id, data: { label: "feeds" } },
      { canvasId, source: c.id, target: a.id },
    ],
  });

  const runCtx = {
    runQuery: t.query,
    runMutation: t.mutation,
    runAction: t.action,
  } as unknown as ToolRunCtx;
  return {
    read: (scope: ToolScope, nodeIds: string[]) =>
      readNodes(runCtx, scope, nodeIds),
    scope: canvasScope({ userId, canvasId }),
    ids: {
      a: a.id,
      b: b.id,
      c: c.id,
      frame: frame.id,
      lower: lower.id,
      upper: upper.id,
      custom: custom.id,
      links,
    },
    bNodeDataId: b.nodeDataId,
  };
}

describe("readNodes", () => {
  test("rend les nodes dans l'ordre demandé, doublons et erreurs compris", async () => {
    const { read, scope, ids } = await setup();
    const { nodes } = await read(scope, [ids.b, "missing", ids.b]);
    expect(nodes.map((node) => [node.id, node.ok])).toEqual([
      [ids.b, true],
      ["missing", false],
      [ids.b, true],
    ]);
    expect(nodes[1]).toMatchObject({ ok: false, type: "unknown" });
  });

  test("lit au-delà d'un lot (10 contenus par transaction)", async () => {
    const { read, scope, ids } = await setup();
    const { nodes } = await read(scope, ids.links);
    expect(nodes).toHaveLength(12);
    expect(nodes.every((node) => node.ok)).toBe(true);
  });

  test("connexions, mentions, enfants de frame", async () => {
    const { read, scope, ids, bNodeDataId } = await setup();
    const { nodes, mentions } = await read(scope, [ids.a, ids.frame]);
    expect(nodes[0]).toMatchObject({
      sources: [{ id: ids.c, type: "blocknote", title: "C", label: null }],
      targets: [{ id: ids.b, type: "blocknote", title: "B", label: "feeds" }],
    });
    expect(mentions.get(bNodeDataId)).toEqual({
      id: ids.b,
      type: "blocknote",
      title: "B",
    });
    // Ordre de lecture : y puis x, en coordonnées monde.
    expect(nodes[1]).toMatchObject({
      children: [
        { id: ids.upper, title: "Upper", x: 1010, y: 50 },
        { id: ids.lower, title: "Lower", x: 1010, y: 300 },
      ],
    });
  });

  test("un custom node porte le titre de son template", async () => {
    const { read, scope, ids } = await setup();
    const { nodes } = await read(scope, [ids.custom]);
    expect(nodes[0]).toMatchObject({ ok: true, title: "Ada Lovelace" });
  });

  describe("scope", () => {
    test("un node hors du scope de lecture est introuvable", async () => {
      const { read, scope, ids } = await setup();
      const { nodes } = await read({ ...scope, read: [ids.a] }, [ids.b]);
      expect(nodes[0]).toMatchObject({ ok: false, type: "unknown" });
    });

    test("ni connexion, ni mention, ni enfant de frame hors scope", async () => {
      const { read, scope, ids, bNodeDataId } = await setup();
      const { nodes, mentions } = await read(
        { ...scope, read: [ids.a, ids.frame, ids.upper] },
        [ids.a, ids.frame],
      );
      expect(nodes[0]).toMatchObject({ sources: [], targets: [] });
      expect(mentions.has(bNodeDataId)).toBe(false);
      expect(nodes[1]).toMatchObject({ children: [{ id: ids.upper }] });
    });
  });
});
