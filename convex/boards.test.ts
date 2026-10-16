import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import { BOARD_PRESETS, listBoardSpaces } from "./config/boardConfig";
import { createNode, setupTools } from "./tools/testing.helpers";

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
