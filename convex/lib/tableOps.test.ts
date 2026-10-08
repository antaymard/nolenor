import { describe, expect, test } from "vitest";
import type { TableOp } from "../schemas/tableOpsSchema";
import {
  applyTableOps,
  diffMoves,
  readStoredTable,
  type TableState,
} from "./tableOps";

const state = (): TableState => ({
  title: "T",
  table: {
    columns: [
      { id: "name", name: "Name", type: "text" },
      {
        id: "tag",
        name: "Tag",
        type: "select",
        options: [
          { id: "a", label: "A", color: "red" },
          { id: "b", label: "B", color: "blue" },
        ],
        isMulti: true,
      },
    ],
    rows: [
      { id: "r1", cells: { name: "one", tag: ["a", "b"] } },
      { id: "r2", cells: { name: "two", tag: ["b"] } },
      { id: "r3", cells: { name: "3", tag: null } },
    ],
    rowHeight: "short",
  },
});

const apply = (ops: TableOp[], from = state()) => applyTableOps(from, ops);
const rowIds = (s: TableState) => s.table.rows.map((row) => row.id);

describe("applyTableOps", () => {
  test("does not mutate its input", () => {
    const before = state();
    const snapshot = JSON.stringify(before);
    apply(
      [
        {
          kind: "setCells",
          cells: [{ rowId: "r1", columnId: "name", value: "x" }],
        },
        { kind: "deleteColumns", columnIds: ["tag"] },
        { kind: "moveRow", rowId: "r3", beforeRowId: "r1" },
      ],
      before,
    );
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  test("cell writes on different cells add up, the last one wins on the same cell", () => {
    const next = apply([
      {
        kind: "setCells",
        cells: [{ rowId: "r1", columnId: "name", value: "A" }],
      },
      {
        kind: "setCells",
        cells: [{ rowId: "r2", columnId: "name", value: "B" }],
      },
      {
        kind: "setCells",
        cells: [{ rowId: "r1", columnId: "name", value: "C" }],
      },
    ]);
    expect(next.table.rows.map((row) => row.cells.name)).toEqual([
      "C",
      "B",
      "3",
    ]);
  });

  test("writes to a deleted row or column are ignored", () => {
    const next = apply([
      { kind: "deleteRows", rowIds: ["r2"] },
      { kind: "deleteColumns", columnIds: ["tag"] },
      {
        kind: "setCells",
        cells: [
          { rowId: "r2", columnId: "name", value: "ghost" },
          { rowId: "r1", columnId: "tag", value: ["a"] },
        ],
      },
    ]);
    expect(next.table.rows).toEqual([
      { id: "r1", cells: { name: "one" } },
      { id: "r3", cells: { name: "3" } },
    ]);
  });

  test("a value written for an outdated column type is converted", () => {
    const next = apply([
      { kind: "updateColumn", columnId: "name", patch: { type: "number" } },
      {
        kind: "setCells",
        cells: [
          { rowId: "r1", columnId: "name", value: "42", columnType: "text" },
        ],
      },
    ]);
    // "one"/"two" ne sont pas des nombres, "3" l'est.
    expect(next.table.rows.map((row) => row.cells.name)).toEqual([42, null, 3]);
  });

  test("inserted rows land after their anchor, with a cell per column", () => {
    const next = apply([
      {
        kind: "insertRows",
        rows: [{ id: "n1", cells: { name: "new" } }],
        position: { afterRowId: "r1" },
      },
      {
        kind: "insertRows",
        rows: [{ id: "n0", cells: {} }],
        position: "start",
      },
      // Ancre disparue : en fin de table.
      {
        kind: "insertRows",
        rows: [{ id: "n9", cells: {} }],
        position: { afterRowId: "gone" },
      },
      // Rejeu : pas de doublon.
      { kind: "insertRows", rows: [{ id: "n1", cells: {} }], position: "end" },
    ]);
    expect(rowIds(next)).toEqual(["n0", "r1", "n1", "r2", "r3", "n9"]);
    expect(next.table.rows[2].cells).toEqual({ name: "new", tag: null });
  });

  test("moves are relative to an id", () => {
    expect(
      rowIds(apply([{ kind: "moveRow", rowId: "r3", beforeRowId: "r1" }])),
    ).toEqual(["r3", "r1", "r2"]);
    expect(
      rowIds(apply([{ kind: "moveRow", rowId: "r1", beforeRowId: null }])),
    ).toEqual(["r2", "r3", "r1"]);
    // Repère disparu : rien ne bouge.
    expect(
      rowIds(apply([{ kind: "moveRow", rowId: "r1", beforeRowId: "gone" }])),
    ).toEqual(["r1", "r2", "r3"]);
    const columns = apply([
      { kind: "moveColumn", columnId: "tag", beforeColumnId: "name" },
    ]);
    expect(columns.table.columns.map((c) => c.id)).toEqual(["tag", "name"]);
  });

  test("changing select options prunes the cells on the current state", () => {
    const next = apply([
      {
        kind: "updateColumn",
        columnId: "tag",
        patch: {
          options: [{ id: "b", label: "B", color: "blue" }],
          isMulti: false,
        },
      },
    ]);
    expect(next.table.rows.map((row) => row.cells.tag)).toEqual([
      ["b"],
      ["b"],
      null,
    ]);
    expect(next.table.columns[1]).toMatchObject({ isMulti: false });
  });

  test("a type change converts cells and drops select-only settings", () => {
    const next = apply([
      { kind: "updateColumn", columnId: "tag", patch: { summary: "countAll" } },
      { kind: "updateColumn", columnId: "tag", patch: { type: "text" } },
    ]);
    expect(next.table.columns[1]).toEqual({
      id: "tag",
      name: "Tag",
      type: "text",
    });
    expect(next.table.rows.map((row) => row.cells.tag)).toEqual([
      "A, B",
      "B",
      null,
    ]);
  });

  test("view, title, columns and replaceAll", () => {
    const next = apply([
      {
        kind: "setView",
        view: { sorting: [{ columnId: "name", desc: true }] },
      },
      { kind: "setTitle", title: "New" },
      {
        kind: "addColumn",
        column: { id: "done", name: "Done", type: "checkbox" },
      },
      {
        kind: "updateColumn",
        columnId: "done",
        patch: { width: 120, name: "OK" },
      },
    ]);
    expect(next.title).toBe("New");
    expect(next.table.rowHeight).toBe("short");
    expect(next.table.sorting).toEqual([{ columnId: "name", desc: true }]);
    expect(next.table.columns[2]).toEqual({
      id: "done",
      name: "OK",
      type: "checkbox",
      width: 120,
    });
    expect(next.table.rows.every((row) => row.cells.done === null)).toBe(true);

    const replaced = apply([
      {
        kind: "replaceAll",
        columns: [{ id: "x", name: "X", type: "text" }],
        rows: [{ id: "only", cells: {} }],
      },
    ]);
    expect(replaced.table).toMatchObject({
      columns: [{ id: "x" }],
      rows: [{ id: "only", cells: { x: null } }],
      rowHeight: "short",
    });
  });
});

describe("readStoredTable", () => {
  test("reads a missing or damaged table as an empty one", () => {
    expect(readStoredTable(undefined)).toEqual({ columns: [], rows: [] });
    expect(readStoredTable({ rows: [null, { id: "r" }] })).toEqual({
      columns: [],
      rows: [{ id: "r", cells: {} }],
    });
  });
});

describe("diffMoves", () => {
  test("finds the single move of a drag and drop", () => {
    expect(diffMoves(["a", "b", "c", "d"], ["a", "b", "c", "d"])).toEqual([]);
    expect(diffMoves(["a", "b", "c", "d"], ["c", "a", "b", "d"])).toEqual([
      { id: "c", beforeId: "a" },
    ]);
    expect(diffMoves(["a", "b", "c", "d"], ["b", "c", "d", "a"])).toEqual([
      { id: "a", beforeId: null },
    ]);
    expect(diffMoves(["a", "b", "c"], ["a", "c", "b"])).toEqual([
      { id: "c", beforeId: "b" },
    ]);
  });

  test("falls back to moves that rebuild any order", () => {
    const before = ["a", "b", "c", "d"];
    const after = ["d", "c", "b", "a"];
    const rows = before.map((id) => ({ id, cells: {} }));
    const next = applyTableOps(
      { title: "", table: { columns: [], rows } },
      diffMoves(before, after).map(({ id, beforeId }) => ({
        kind: "moveRow" as const,
        rowId: id,
        beforeRowId: beforeId,
      })),
    );
    expect(next.table.rows.map((row) => row.id)).toEqual(after);
  });
});
