import { describe, expect, test } from "vitest";
import { internal } from "../../_generated/api";
import type { ToolScope } from "../scope";
import { blocknoteDoc, createNode, setupTools } from "../testing.helpers";
import { readNodes } from "./readNodes";

/** Un document dont le paragraphe est une mention du nodeData donné. */
const mentioning = (title: string, nodeDataId: string) => {
  const blocks = JSON.parse(blocknoteDoc(title));
  blocks.push({
    id: "p",
    type: "paragraph",
    props: {},
    content: [{ type: "mention", props: { nodeDataId, title: "Old title" } }],
    children: [],
  });
  return JSON.stringify(blocks);
};

/**
 * a → b, c → a ; a mentionne b ; une frame avec deux enfants ; un custom
 * node dont le titre vient de son template ; douze liens pour les lots.
 */
async function setup() {
  const tools = await setupTools();
  const templateId = await tools.t.run((ctx) =>
    ctx.db.insert("nodeTemplates", {
      creatorId: tools.userId,
      name: "Contact",
      fields: [
        { id: "a_note", name: "Note", type: "short_text" },
        { id: "z_name", name: "Name", type: "short_text" },
      ],
      nodeLayout: {},
      titleFieldId: "z_name",
      defaultDimensions: { width: 200, height: 100 },
      updatedAt: 0,
    }),
  );
  const note = (title: string, at: { x?: number; y?: number; parentId?: string } = {}) =>
    createNode(tools, {
      type: "blocknote",
      values: { doc: blocknoteDoc(title) },
      ...at,
    });

  const b = await note("B");
  const a = await createNode(tools, {
    type: "blocknote",
    values: { doc: mentioning("A", b.nodeDataId) },
  });
  const c = await note("C");
  const frame = await createNode(tools, {
    type: "frame",
    values: { title: "Group" },
    x: 1000,
  });
  const lower = await note("Lower", { x: 10, y: 300, parentId: frame.id });
  const upper = await note("Upper", { x: 10, y: 50, parentId: frame.id });
  const custom = await createNode(tools, {
    type: "custom",
    templateId,
    values: { a_note: "a note", z_name: "Ada Lovelace" },
  });
  const links: string[] = [];
  for (let i = 0; i < 12; i++) {
    const link = await createNode(tools, {
      type: "link",
      values: { link: { href: `https://l${i}.test` } },
    });
    links.push(link.id);
  }
  await tools.t.mutation(internal.wrappers.edgeWrappers.create, {
    edges: [
      { canvasId: tools.canvasId, source: a.id, target: b.id, data: { label: "feeds" } },
      { canvasId: tools.canvasId, source: c.id, target: a.id },
    ],
  });

  return {
    read: (scope: ToolScope, nodeIds: string[]) =>
      readNodes(tools.run, scope, nodeIds),
    scope: tools.scope,
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

  test("frame à zones : la zone de chaque enfant, zone par zone", async () => {
    const tools = await setupTools();
    // 100 de large (cf. `createNode`) : deux colonnes de 50.
    const board = await createNode(tools, {
      type: "frame",
      values: { title: "Board", zones: { columns: ["To do", "Done"], rows: [] } },
    });
    const card = (title: string, x: number, y: number) =>
      createNode(tools, {
        type: "blocknote",
        values: { doc: blocknoteDoc(title) },
        x,
        y,
        parentId: board.id,
      });
    const done = await card("Shipped", 60, 50);
    const todo = await card("Write", -60, 200);

    const [frame] = (await readNodes(tools.run, tools.scope, [board.id])).nodes;
    expect(frame).toMatchObject({
      zones: [
        { name: "To do", x: 0, width: 50 },
        { name: "Done", x: 50, width: 50 },
      ],
      // « To do » d'abord, même plus bas.
      children: [
        { id: todo.id, zone: "To do" },
        { id: done.id, zone: "Done" },
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
