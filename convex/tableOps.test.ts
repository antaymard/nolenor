/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import debouncerSchema from "./components/debouncer/schema";
import { modules } from "./test.setup";

function setup() {
  const t = convexTest(schema, modules);
  t.registerComponent(
    "debouncer",
    debouncerSchema,
    import.meta.glob("./components/debouncer/**/*.ts"),
  );
  return t;
}
type T = ReturnType<typeof setup>;

async function seed(t: T) {
  return t.run(async (ctx) => {
    const owner = await ctx.db.insert("users", {});
    const reader = await ctx.db.insert("users", {});
    const coEditor = await ctx.db.insert("users", {});
    const stranger = await ctx.db.insert("users", {});
    const canvasId = await ctx.db.insert("canvases", {
      creatorId: owner,
      name: "Canvas",
      updatedAt: Date.now(),
    });
    for (const [userId, permission] of [
      [reader, "viewer"],
      [coEditor, "editor"],
    ] as const) {
      await ctx.db.insert("shares", {
        resourceType: "canvas",
        canvasId,
        userId,
        permission,
        grantedBy: owner,
      });
    }
    const nodeDataId = await ctx.db.insert("nodeDatas", {
      canvasId,
      type: "table",
      updatedAt: Date.now(),
      values: {
        title: "Tasks",
        table: {
          columns: [
            { id: "name", name: "Name", type: "text" },
            { id: "done", name: "Done", type: "checkbox" },
          ],
          rows: [
            { id: "r1", cells: { name: "one", done: false } },
            { id: "r2", cells: { name: "two", done: false } },
          ],
        },
      },
    });
    return { owner, reader, coEditor, stranger, canvasId, nodeDataId };
  });
}

const as = (t: T, userId: Id<"users">) =>
  t.withIdentity({ subject: `${userId}|session` });

const setCell = (rowId: string, columnId: string, value: unknown) => ({
  kind: "setCells" as const,
  cells: [{ rowId, columnId, value }],
});

async function readTable(t: T, nodeDataId: Id<"nodeDatas">) {
  const nodeData = await t.run((ctx) => ctx.db.get("nodeDatas", nodeDataId));
  return nodeData?.values as {
    title: string;
    table: { rows: Array<{ id: string; cells: Record<string, unknown> }> };
  };
}

const cellsOf = async (t: T, nodeDataId: Id<"nodeDatas">) =>
  Object.fromEntries(
    (await readTable(t, nodeDataId)).table.rows.map((row) => [
      row.id,
      row.cells,
    ]),
  );

const versionActors = (t: T) =>
  t.run(async (ctx) =>
    (await ctx.db.query("nodeDataVersions").collect()).map(
      (version) => version.actor,
    ),
  );

describe("table ops", () => {
  test("two editors writing different cells keep both writes", async () => {
    const t = setup();
    const { owner, coEditor, nodeDataId } = await seed(t);

    // Chacun part du même état : avant, la seconde sauvegarde de la table
    // entière effaçait la première.
    await as(t, owner).mutation(api.tableOps.apply, {
      nodeDataId,
      ops: [setCell("r1", "name", "owner was here")],
    });
    await as(t, coEditor).mutation(api.tableOps.apply, {
      nodeDataId,
      ops: [setCell("r2", "done", true)],
    });

    expect(await cellsOf(t, nodeDataId)).toEqual({
      r1: { name: "owner was here", done: false },
      r2: { name: "two", done: true },
    });
  });

  test("a write to a row deleted meanwhile is dropped", async () => {
    const t = setup();
    const { owner, coEditor, nodeDataId } = await seed(t);

    await as(t, coEditor).mutation(api.tableOps.apply, {
      nodeDataId,
      ops: [{ kind: "deleteRows", rowIds: ["r1"] }],
    });
    await as(t, owner).mutation(api.tableOps.apply, {
      nodeDataId,
      ops: [setCell("r1", "name", "too late")],
    });

    expect(await cellsOf(t, nodeDataId)).toEqual({
      r2: { name: "two", done: false },
    });
  });

  test("the agent and a human editing at the same time both land", async () => {
    const t = setup();
    const { owner, nodeDataId } = await seed(t);
    const agent = { type: "agent" as const, userId: owner };

    await as(t, owner).mutation(api.tableOps.apply, {
      nodeDataId,
      ops: [setCell("r1", "name", "human")],
    });
    await t.mutation(internal.wrappers.nodeDataWrappers.applyTableOps, {
      _id: nodeDataId,
      ops: [
        setCell("r2", "name", "agent"),
        {
          kind: "insertRows",
          rows: [{ id: "r3", cells: { name: "added" } }],
          position: { afterRowId: "r1" },
        },
      ],
      actor: agent,
    });
    await as(t, owner).mutation(api.tableOps.apply, {
      nodeDataId,
      ops: [setCell("r1", "done", true)],
    });

    const { table } = await readTable(t, nodeDataId);
    expect(table.rows).toEqual([
      { id: "r1", cells: { name: "human", done: true } },
      { id: "r3", cells: { name: "added", done: null } },
      { id: "r2", cells: { name: "agent", done: false } },
    ]);
  });

  test("humans editing together share one restore point, the agent gets its own", async () => {
    const t = setup();
    const { owner, coEditor, nodeDataId } = await seed(t);

    for (const [userId, value] of [
      [owner, "a"],
      [coEditor, "b"],
      [owner, "c"],
    ] as const) {
      await as(t, userId).mutation(api.tableOps.apply, {
        nodeDataId,
        ops: [setCell("r1", "name", value)],
      });
    }
    expect(await versionActors(t)).toEqual([{ type: "user", userId: owner }]);

    await t.mutation(internal.wrappers.nodeDataWrappers.applyTableOps, {
      _id: nodeDataId,
      ops: [setCell("r2", "name", "agent")],
      actor: { type: "agent", userId: owner },
    });
    expect(await versionActors(t)).toEqual([
      { type: "user", userId: owner },
      { type: "agent", userId: owner },
    ]);
  });

  test("ops that change nothing write nothing", async () => {
    const t = setup();
    const { owner, nodeDataId } = await seed(t);
    const before = await t.run((ctx) => ctx.db.get("nodeDatas", nodeDataId));

    await as(t, owner).mutation(api.tableOps.apply, {
      nodeDataId,
      ops: [setCell("r1", "name", "one"), setCell("gone", "name", "x")],
    });

    const after = await t.run((ctx) => ctx.db.get("nodeDatas", nodeDataId));
    expect(after?.updatedAt).toBe(before?.updatedAt);
    expect(await versionActors(t)).toEqual([]);
  });

  test("title and shared view are ops too", async () => {
    const t = setup();
    const { owner, nodeDataId } = await seed(t);

    await as(t, owner).mutation(api.tableOps.apply, {
      nodeDataId,
      ops: [
        { kind: "setTitle", title: "Renamed" },
        {
          kind: "setView",
          view: {
            rowHeight: "tall",
            sorting: [{ columnId: "name", desc: true }],
          },
        },
      ],
    });

    const values = await readTable(t, nodeDataId);
    expect(values.title).toBe("Renamed");
    expect(values.table).toMatchObject({
      rowHeight: "tall",
      sorting: [{ columnId: "name", desc: true }],
    });
  });

  test("reindexing waits for edits to settle instead of running per op", async () => {
    const t = setup();
    const { owner, nodeDataId } = await seed(t);

    for (const value of ["a", "b", "c"]) {
      await as(t, owner).mutation(api.tableOps.apply, {
        nodeDataId,
        ops: [setCell("r1", "name", value)],
      });
    }

    const reindexJobs = async () =>
      (
        await t.run((ctx) =>
          ctx.db.system.query("_scheduled_functions").collect(),
        )
      ).filter((job) => job.name.includes("rebuildChunks"));
    expect(await reindexJobs()).toEqual([]);

    // Témoin : une écriture ordinaire, elle, réindexe aussitôt.
    await as(t, owner).mutation(api.nodeDatas.updateValues, {
      _id: nodeDataId,
      values: { title: "Other" },
    });
    expect(await reindexJobs()).toHaveLength(1);
  });

  test("only canvas editors can apply ops", async () => {
    const t = setup();
    const { reader, stranger, nodeDataId } = await seed(t);
    const ops = [setCell("r1", "name", "nope")];

    await expect(
      as(t, reader).mutation(api.tableOps.apply, { nodeDataId, ops }),
    ).rejects.toThrow();
    await expect(
      as(t, stranger).mutation(api.tableOps.apply, { nodeDataId, ops }),
    ).rejects.toThrow();
    await expect(
      t.mutation(api.tableOps.apply, { nodeDataId, ops }),
    ).rejects.toThrow();
    expect((await cellsOf(t, nodeDataId)).r1.name).toBe("one");
  });
});
