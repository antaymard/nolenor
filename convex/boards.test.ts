import { beforeAll, describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { BOARD_PRESETS, listBoardSpaces } from "./config/boardConfig";
import {
  createNode,
  enableRequire,
  setupTools,
  stdout,
} from "./tools/testing.helpers";
import { readNodes } from "./tools/nodes/readNodes";

beforeAll(enableRequire);

/** Un board en Kanban, une frame, et une carte libre. */
async function setup() {
  const tools = await setupTools();
  const layout = BOARD_PRESETS.kanban();
  const [todo, doing] = listBoardSpaces(layout).map((space) => space.id);
  const board = await createNode(tools, { type: "board", values: { layout } });
  const frame = await createNode(tools, { type: "frame", values: {} });
  const card = await createNode(tools, { type: "blocknote" });

  const patch = (nodeId: string, props: Record<string, unknown>) =>
    tools.t.mutation(internal.wrappers.nodeWrappers.patch, {
      updates: [{ nodeId, props }],
    });
  const read = (nodeId: string) =>
    tools.t.run((ctx) =>
      ctx.db
        .query("nodes")
        .withIndex("by_llmid", (q) => q.eq("id", nodeId))
        .unique(),
    );
  return { tools, board, frame, card, todo, doing, patch, read };
}

describe("boards", () => {
  test("une carte entre dans un board, rangée dans un espace", async () => {
    const { board, card, todo, patch, read } = await setup();
    await patch(card.id, {
      parentId: board.id,
      placement: { spaceId: todo, order: "i" },
    });
    expect(await read(card.id)).toMatchObject({
      parentId: board.id,
      placement: { spaceId: todo, order: "i" },
    });
  });

  test("changer de conteneur sans rangement efface l'ancien", async () => {
    const { board, frame, card, todo, patch, read } = await setup();
    await patch(card.id, {
      parentId: board.id,
      placement: { spaceId: todo, order: "i" },
    });
    await patch(card.id, { parentId: frame.id });
    const moved = await read(card.id);
    expect(moved?.parentId).toBe(frame.id);
    expect(moved?.placement).toBeUndefined();
  });

  test("réordonner dans le board garde le parent", async () => {
    const { board, card, todo, doing, patch, read } = await setup();
    await patch(card.id, {
      parentId: board.id,
      placement: { spaceId: todo, order: "i" },
    });
    await patch(card.id, { placement: { spaceId: doing, order: "a" } });
    expect(await read(card.id)).toMatchObject({
      parentId: board.id,
      placement: { spaceId: doing, order: "a" },
    });
  });

  test("un conteneur n'entre pas dans un autre", async () => {
    const { board, frame, patch } = await setup();
    await expect(patch(board.id, { parentId: frame.id })).rejects.toThrow();
    await expect(patch(frame.id, { parentId: board.id })).rejects.toThrow();
  });

  test("supprimer un board supprime ce qu'il range", async () => {
    const { tools, board, card, todo, patch, read } = await setup();
    await patch(card.id, {
      parentId: board.id,
      placement: { spaceId: todo, order: "i" },
    });
    await tools.t.mutation(internal.wrappers.nodeWrappers.trash, {
      nodeIds: [board.id],
    });
    expect((await read(card.id))?.status).toBe("trashed");
  });
});

describe("écritures de l'agent", () => {
  const actor = (userId: Id<"users">) => ({
    type: "agent" as const,
    userId,
    threadId: "t",
  });

  async function created(columns = 3, rows = 1, titles?: string[]) {
    const tools = await setupTools();
    const board = await tools.t.mutation(
      internal.wrappers.boardWrappers.create,
      {
        canvasId: tools.canvasId,
        position: { x: 0, y: 0 },
        columns,
        rows,
        ...(titles && { titles }),
      },
    );
    const place = (
      items: Array<{ nodeId: string; spaceId: string; index?: number }>,
    ) =>
      tools.t.mutation(internal.wrappers.boardWrappers.place, {
        canvasId: tools.canvasId,
        boardId: board.boardId,
        items,
      });
    const read = async () =>
      (await readNodes(tools.run, tools.scope, [board.boardId])).nodes[0] as {
        spaces?: Array<{ id: string; nodeIds: string[] }>;
      };
    return { tools, board, place, read };
  }

  test("crée une grille et pose un titre en tête de chaque espace", async () => {
    const { board, read } = await created(3, 1, ["To do", "", "Done"]);
    expect(board.spaceIds).toHaveLength(3);
    expect(board.titleNodeIds).toHaveLength(2);
    const { spaces } = await read();
    expect(spaces?.map((space) => space.nodeIds.length)).toEqual([1, 0, 1]);
  });

  test("range dans l'ordre demandé, au rang demandé", async () => {
    const { tools, board, place, read } = await created();
    const [a, b, c] = await Promise.all(
      ["A", "B", "C"].map(() => createNode(tools, { type: "blocknote" })),
    );
    const [todo] = board.spaceIds;
    await place([
      { nodeId: a.id, spaceId: todo },
      { nodeId: b.id, spaceId: todo },
      { nodeId: c.id, spaceId: todo, index: 0 },
    ]);
    const { spaces } = await read();
    expect(spaces?.[0].nodeIds).toEqual([c.id, a.id, b.id]);

    // Déplacer dans le même board : change d'espace, garde le parent.
    await place([{ nodeId: a.id, spaceId: board.spaceIds[2] }]);
    expect((await read()).spaces?.map((space) => space.nodeIds)).toEqual([
      [c.id, b.id],
      [],
      [a.id],
    ]);
  });

  test("refuse tout l'appel si un node est déjà dans une frame", async () => {
    const { tools, board, place, read } = await created();
    const frame = await createNode(tools, { type: "frame" });
    const free = await createNode(tools, { type: "blocknote" });
    const taken = await createNode(tools, {
      type: "blocknote",
      parentId: frame.id,
    });
    await expect(
      place([
        { nodeId: free.id, spaceId: board.spaceIds[0] },
        { nodeId: taken.id, spaceId: board.spaceIds[0] },
      ]),
    ).rejects.toThrow();
    expect((await read()).spaces?.[0].nodeIds).toEqual([]);
  });

  test("changer la grille garde les espaces dans l'ordre", async () => {
    const { tools, board } = await created(3, 1);
    const result = await tools.t.mutation(
      internal.wrappers.boardWrappers.setGrid,
      {
        canvasId: tools.canvasId,
        boardId: board.boardId,
        columns: 2,
        rows: 1,
        actor: actor(tools.userId),
      },
    );
    expect(result.spaceIds).toEqual(board.spaceIds.slice(0, 2));
    expect(result.removedSpaceIds).toEqual([board.spaceIds[2]]);
  });

  test("nole read rend les espaces et ce que chacun range", async () => {
    const { tools, board } = await created(2, 1, ["To do"]);
    const output = stdout(await tools.bash(`nole read ${board.boardId}`));
    expect(output).toContain('<contents count="1" spaces="2">');
    expect(output).toContain(
      `<space id="${board.spaceIds[0]}" index="1" count="1">`,
    );
    expect(output).toContain(
      `<space id="${board.spaceIds[1]}" index="2" count="0" />`,
    );
    expect(output).toContain('title="To do"');
  });
});
