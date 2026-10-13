import {
  assertNeverColumnType,
  TABLE_COLUMN_TYPES,
  type TableColumnType,
} from "../../lib/tableColumnTypes";
import { richTextToPlainText } from "../../lib/tableRichTextCell";
import { readNodeContents, readNodeTitles } from "../nodes/nodeContents";
import type { ToolRunCtx } from "../runtime";
import type { ToolScope } from "../scope";

/**
 * Noyau : toutes les lignes d'une table, avec des valeurs lisibles — le
 * libellé d'une option plutôt que son id, le titre d'un node référencé, le
 * texte d'une cellule rich text. Pas de plafond : c'est ce qui permet de
 * compter, sommer ou comparer sans lire la table à l'œil.
 *
 * Lecture seule ; les écritures restent aux tools `table_*`, qui prennent
 * les ids de lignes et de colonnes rendus ici.
 */

export type TableColumnInfo = {
  id: string;
  name: string;
  type: TableColumnType;
  /** Select : plusieurs valeurs possibles. */
  isMulti: boolean;
  /** Select : les options, dans l'ordre. */
  options: Array<{ id: string; label: string }>;
};

/** Une valeur de cellule, selon le type de sa colonne. */
export type TableCellValue =
  /** text, richtext (aplati), date (ISO) */
  | string
  /** number */
  | number
  /** checkbox */
  | boolean
  /** select : les libellés (une seule valeur hors multi) */
  | string[]
  /** link */
  | { href: string; title: string | null }
  /** node : `title` null si le node n'existe plus (ou hors scope) */
  | { nodeId: string; title: string | null }
  /** cellule vide */
  | null;

export type TableData = {
  nodeId: string;
  title: string;
  columns: TableColumnInfo[];
  rows: Array<{ id: string; cells: Record<string, TableCellValue> }>;
};

type StoredColumn = {
  id: string;
  name?: string;
  type?: string;
  isMulti?: boolean;
  options?: Array<{ id: string; label?: string }>;
};
type StoredRow = { id: string; cells?: Record<string, unknown> };

function columnType(type: string | undefined): TableColumnType {
  return (TABLE_COLUMN_TYPES as readonly string[]).includes(type ?? "")
    ? (type as TableColumnType)
    : "text";
}

export async function readTable(
  ctx: ToolRunCtx,
  scope: ToolScope,
  nodeId: string,
): Promise<{ ok: true; table: TableData } | { ok: false; error: string }> {
  const [content] = await readNodeContents(ctx, scope, [nodeId]);
  if (!content.ok) return { ok: false, error: `node "${nodeId}" not found` };
  if (content.type !== "table") {
    return {
      ok: false,
      error: `node "${nodeId}" is a ${content.type}, not a table`,
    };
  }

  const stored = (content.nodeData.values.table ?? {}) as {
    columns?: StoredColumn[];
    rows?: StoredRow[];
  };
  const columns: TableColumnInfo[] = (stored.columns ?? []).map((column) => ({
    id: column.id,
    name: column.name ?? column.id,
    type: columnType(column.type),
    isMulti: column.isMulti === true,
    options: (column.options ?? []).map((option) => ({
      id: option.id,
      label: option.label ?? option.id,
    })),
  }));
  const rows = stored.rows ?? [];

  // Les titres des nodes référencés, en une passe.
  const referenced = new Set<string>();
  for (const column of columns) {
    if (column.type !== "node") continue;
    for (const row of rows) {
      const nodeIdInCell = (row.cells?.[column.id] as { nodeId?: unknown })
        ?.nodeId;
      if (typeof nodeIdInCell === "string" && nodeIdInCell) {
        referenced.add(nodeIdInCell);
      }
    }
  }
  const titles = await readNodeTitles(ctx, scope, referenced);

  const cellValue = (column: TableColumnInfo, raw: unknown): TableCellValue => {
    if (raw === null || raw === undefined || raw === "") return null;
    switch (column.type) {
      case "text":
      case "date":
        return String(raw);
      case "richtext":
        return richTextToPlainText(raw) || null;
      case "number": {
        const value = typeof raw === "number" ? raw : Number(raw);
        return Number.isFinite(value) ? value : null;
      }
      case "checkbox":
        return raw === true;
      case "select": {
        const ids = Array.isArray(raw) ? raw : [raw];
        const labels = ids
          .filter((id): id is string => typeof id === "string")
          .map(
            (id) =>
              column.options.find((option) => option.id === id)?.label ?? id,
          );
        return labels.length > 0 ? labels : null;
      }
      case "link": {
        const link = raw as { href?: unknown; pageTitle?: unknown };
        if (typeof link.href !== "string" || !link.href) return null;
        return {
          href: link.href,
          title:
            typeof link.pageTitle === "string" && link.pageTitle
              ? link.pageTitle
              : null,
        };
      }
      case "node": {
        const target = (raw as { nodeId?: unknown }).nodeId;
        if (typeof target !== "string" || !target) return null;
        return { nodeId: target, title: titles.get(target)?.title ?? null };
      }
      default:
        return assertNeverColumnType(column.type, "readTable");
    }
  };

  return {
    ok: true,
    table: {
      nodeId,
      title: content.title,
      columns,
      rows: rows.map((row) => ({
        id: row.id,
        cells: Object.fromEntries(
          columns.map((column) => [
            column.id,
            cellValue(column, row.cells?.[column.id]),
          ]),
        ),
      })),
    },
  };
}
