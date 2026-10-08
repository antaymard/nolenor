import type { TableOp, TableOpColumn } from "../schemas/tableOpsSchema";
import { coerceCellValue } from "./tableCellCoerce";

/**
 * Application des opérations de table (cf. `schemas/tableOpsSchema.ts`) à un
 * état de table. Pure et sans mutation de ses entrées : le serveur l'applique
 * à l'état stocké (cf. `models/tableModels.ts`), la grille au cache local de
 * Convex pour sa mise à jour optimiste — les deux voient donc exactement le
 * même résultat.
 *
 * Règles de concurrence, les mêmes partout :
 * - dernier qui écrit gagne, à la CELLULE : deux écritures sur deux cellules
 *   différentes se cumulent ;
 * - une opération qui vise une ligne ou une colonne disparue entre-temps ne
 *   fait rien (pas d'erreur : l'autre a supprimé, sa suppression gagne) ;
 * - une ligne déjà présente n'est pas réinsérée (rejeu d'une mutation).
 */

type StoredColumn = TableOpColumn & Record<string, unknown>;
type StoredRow = { id: string; cells: Record<string, unknown> };

export type StoredTable = {
  columns: StoredColumn[];
  rows: StoredRow[];
  rowHeight?: string;
  filters?: unknown[];
  filterConjunction?: "all" | "any";
  sorting?: unknown[];
};

export type TableState = { table: StoredTable; title: string };

/**
 * `values.table` est un `v.any()` : rien ne garantit sa forme. Une table
 * absente ou abîmée se lit comme une table vide plutôt que de faire échouer
 * toutes les écritures suivantes.
 */
export function readStoredTable(raw: unknown): StoredTable {
  const table =
    raw && typeof raw === "object" ? (raw as Partial<StoredTable>) : {};
  const columns = Array.isArray(table.columns)
    ? table.columns.filter(
        (column): column is StoredColumn =>
          !!column &&
          typeof column === "object" &&
          typeof column.id === "string",
      )
    : [];
  const rows = Array.isArray(table.rows)
    ? table.rows
        .filter(
          (row): row is StoredRow =>
            !!row && typeof row === "object" && typeof row.id === "string",
        )
        .map((row) =>
          row.cells && typeof row.cells === "object"
            ? row
            : { ...row, cells: {} },
        )
    : [];
  return { ...table, columns, rows };
}

export function applyTableOps(
  state: TableState,
  ops: ReadonlyArray<TableOp>,
): TableState {
  return ops.reduce(applyTableOp, state);
}

function applyTableOp(state: TableState, op: TableOp): TableState {
  const { table } = state;
  switch (op.kind) {
    case "setCells":
      return { ...state, table: setCells(table, op.cells) };

    case "insertRows": {
      const existing = new Set(table.rows.map((row) => row.id));
      const inserted = op.rows
        .filter((row) => !existing.has(row.id))
        .map((row) => withCellsForColumns(row, table.columns));
      if (inserted.length === 0) return state;
      const { position } = op;
      let index = table.rows.length;
      if (position === "start") index = 0;
      else if (position !== "end") {
        const anchor = table.rows.findIndex(
          (row) => row.id === position.afterRowId,
        );
        if (anchor !== -1) index = anchor + 1;
      }
      const rows = [...table.rows];
      rows.splice(index, 0, ...inserted);
      return { ...state, table: { ...table, rows } };
    }

    case "deleteRows": {
      const ids = new Set(op.rowIds);
      const rows = table.rows.filter((row) => !ids.has(row.id));
      if (rows.length === table.rows.length) return state;
      return { ...state, table: { ...table, rows } };
    }

    case "moveRow": {
      const rows = moveBefore(table.rows, op.rowId, op.beforeRowId);
      return rows ? { ...state, table: { ...table, rows } } : state;
    }

    case "addColumn": {
      if (table.columns.some((column) => column.id === op.column.id)) {
        return state;
      }
      const columnId = op.column.id;
      return {
        ...state,
        table: {
          ...table,
          columns: [...table.columns, op.column],
          // Une cellule `null` plutôt qu'absente : les éditeurs de la grille
          // lisent `row.cells[columnId]`.
          rows: table.rows.map((row) => ({
            ...row,
            cells: { ...row.cells, [columnId]: null },
          })),
        },
      };
    }

    case "updateColumn":
      return { ...state, table: updateColumn(table, op.columnId, op.patch) };

    case "deleteColumns": {
      const ids = new Set(op.columnIds);
      if (!table.columns.some((column) => ids.has(column.id))) return state;
      return {
        ...state,
        table: {
          ...table,
          columns: table.columns.filter((column) => !ids.has(column.id)),
          rows: table.rows.map((row) => {
            const cells = { ...row.cells };
            for (const id of ids) delete cells[id];
            return { ...row, cells };
          }),
        },
      };
    }

    case "moveColumn": {
      const columns = moveBefore(table.columns, op.columnId, op.beforeColumnId);
      return columns ? { ...state, table: { ...table, columns } } : state;
    }

    case "setView": {
      const view = Object.fromEntries(
        Object.entries(op.view).filter(([, value]) => value !== undefined),
      );
      return { ...state, table: { ...table, ...view } };
    }

    case "setTitle":
      return { ...state, title: op.title };

    case "replaceAll":
      return {
        ...state,
        table: {
          ...table,
          columns: op.columns,
          rows: op.rows.map((row) => withCellsForColumns(row, op.columns)),
        },
      };
  }
}

function setCells(
  table: StoredTable,
  cells: Extract<TableOp, { kind: "setCells" }>["cells"],
): StoredTable {
  const columnsById = new Map(
    table.columns.map((column) => [column.id, column]),
  );
  const rowIndexById = new Map(table.rows.map((row, index) => [row.id, index]));
  let rows: StoredRow[] | null = null;

  for (const cell of cells) {
    const column = columnsById.get(cell.columnId);
    const index = rowIndexById.get(cell.rowId);
    if (!column || index === undefined) continue;

    const value =
      cell.columnType && cell.columnType !== column.type
        ? coerceCellValue(
            cell.value,
            { type: cell.columnType, options: column.options },
            column.type,
          )
        : cell.value;

    rows ??= [...table.rows];
    const row = rows[index];
    rows[index] = { ...row, cells: { ...row.cells, [column.id]: value } };
  }

  return rows ? { ...table, rows } : table;
}

function updateColumn(
  table: StoredTable,
  columnId: string,
  patch: Extract<TableOp, { kind: "updateColumn" }>["patch"],
): StoredTable {
  const current = table.columns.find((column) => column.id === columnId);
  if (!current) return table;

  let column: StoredColumn = { ...current };
  let rows = table.rows;

  if (patch.type !== undefined && patch.type !== current.type) {
    const to = patch.type;
    // Convertie depuis l'état courant : une cellule écrite par quelqu'un
    // d'autre juste avant passe par la même conversion que les autres.
    rows = rows.map((row) => ({
      ...row,
      cells: {
        ...row.cells,
        [columnId]: coerceCellValue(row.cells[columnId] ?? null, current, to),
      },
    }));
    // L'agrégat dépend du type ; options et mode multi n'ont de sens que pour
    // un select, les traîner sur un autre type ressortirait au retour.
    const { options, isMulti, summary: _summary, ...rest } = column;
    column =
      to === "select"
        ? {
            ...rest,
            type: to,
            options: options ?? [],
            isMulti: isMulti ?? false,
          }
        : { ...rest, type: to };
  }

  if (patch.name !== undefined) column.name = patch.name;
  if (patch.width !== undefined) column.width = patch.width;
  if (patch.summary === null) delete column.summary;
  else if (patch.summary !== undefined) column.summary = patch.summary;

  if (
    column.type === "select" &&
    (patch.options !== undefined || patch.isMulti !== undefined)
  ) {
    const options = patch.options ?? column.options ?? [];
    const isMulti = patch.isMulti ?? column.isMulti ?? false;
    column = { ...column, options, isMulti };
    // Les cellules qui pointent vers une option supprimée la perdent ; hors
    // mode multi, une seule option reste.
    const validIds = new Set(options.map((option) => option.id));
    rows = rows.map((row) => {
      const cell = row.cells[columnId];
      let next: unknown = cell;
      if (Array.isArray(cell)) {
        const kept = cell.filter(
          (id): id is string => typeof id === "string" && validIds.has(id),
        );
        next = isMulti ? kept : kept.slice(0, 1);
        if (
          (next as string[]).length === cell.length &&
          (next as string[]).every((id, i) => id === cell[i])
        ) {
          return row;
        }
      } else if (typeof cell === "string") {
        if (validIds.has(cell)) return row;
        next = null;
      } else {
        return row;
      }
      return { ...row, cells: { ...row.cells, [columnId]: next } };
    });
  }

  return {
    ...table,
    columns: table.columns.map((c) => (c.id === columnId ? column : c)),
    rows,
  };
}

/** Déplace l'élément `id` juste avant `beforeId` (`null` : à la fin). */
function moveBefore<T extends { id: string }>(
  items: T[],
  id: string,
  beforeId: string | null,
): T[] | null {
  if (id === beforeId) return null;
  const from = items.findIndex((item) => item.id === id);
  if (from === -1) return null;
  const rest = items.filter((_, index) => index !== from);
  if (beforeId === null) return [...rest, items[from]];
  const to = rest.findIndex((item) => item.id === beforeId);
  // Repère disparu : on ne devine pas où l'auteur voulait la ligne.
  if (to === -1) return null;
  rest.splice(to, 0, items[from]);
  return rest;
}

function withCellsForColumns(
  row: StoredRow,
  columns: ReadonlyArray<{ id: string }>,
): StoredRow {
  const cells: Record<string, unknown> = {};
  for (const column of columns) cells[column.id] = null;
  return { ...row, cells: { ...cells, ...row.cells } };
}

/**
 * Le déplacement qui mène de `before` à `after`, quand `after` n'est que
 * `before` avec UN élément déplacé (glisser-déposer). Sinon, une suite de
 * déplacements qui reconstruit l'ordre entier.
 *
 * Les gestes de la grille rendent un ordre complet ; la transmettre telle
 * quelle effacerait une ligne insérée par quelqu'un d'autre entre-temps.
 */
export function diffMoves(
  before: ReadonlyArray<string>,
  after: ReadonlyArray<string>,
): Array<{ id: string; beforeId: string | null }> {
  const sameOrder = (a: ReadonlyArray<string>, b: ReadonlyArray<string>) =>
    a.length === b.length && a.every((id, i) => id === b[i]);
  if (sameOrder(before, after)) return [];

  const first = before.findIndex((id, i) => id !== after[i]);
  for (const candidate of [after[first], before[first]]) {
    if (candidate === undefined) continue;
    const without = (list: ReadonlyArray<string>) =>
      list.filter((id) => id !== candidate);
    if (!sameOrder(without(before), without(after))) continue;
    const index = after.indexOf(candidate);
    return [{ id: candidate, beforeId: after[index + 1] ?? null }];
  }

  // Repli : chaque élément, de la fin vers le début, avant son suivant.
  const moves: Array<{ id: string; beforeId: string | null }> = [];
  for (let i = after.length - 1; i >= 0; i--) {
    moves.push({ id: after[i], beforeId: after[i + 1] ?? null });
  }
  return moves;
}
