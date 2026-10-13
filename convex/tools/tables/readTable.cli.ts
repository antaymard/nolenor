import {
  fail,
  ok,
  option,
  parseArgs,
  tsvField,
  type CliCommand,
} from "../shell/cli";
import { readTable, type TableCellValue, type TableColumnInfo } from "./readTable";

/**
 * Adaptateur CLI de `readTable` : `nole table`. Toutes les lignes, une par
 * ligne de sortie, en TSV avec en-tête ou en JSONL — pour jq, awk, sort,
 * diff. Lecture seule.
 */

const HELP = `Usage: nole table [options] <tableId>

Print every row of a table node, no limit, with readable values: option
labels for selects, titles for node references, plain text for rich text.

Output (default): TSV with a header line, first column rowId, then one
column per table column, named as in the table.
  select: labels joined by "; "   node: the node's title   link: the URL
  checkbox: true/false            date: YYYY-MM-DD          empty cell: empty
--format jsonl: one object per row, keys rowId and the column names; select
  values are a string (an array for multi-selects), node references are
  {nodeId, title}, links {href, title}, empty cells null.

Options:
  --columns <a,b…>   Only these columns (names or ids), in this order
  --format <fmt>     tsv (default) or jsonl
  --schema           Print the columns instead of the rows:
                     id  name  type  options (select labels joined by "; ");
                     with --format jsonl, {id, name, type, isMulti, options}

Row and column ids are the ones table_update_rows and table_delete_rows take.
Exit code 1 when the node does not exist or is not a table.

Examples:
  nole table T12ab | awk -F'\\t' 'NR > 1 { total += $4 } END { print total }'
  nole table T12ab --format jsonl | jq -s 'group_by(.Status) | map({status: .[0].Status, count: length})'
  nole table T1 > /tmp/a; nole table T2 > /tmp/b; diff /tmp/a /tmp/b`;

/** Le nom de chaque colonne en sortie ; un nom en double reçoit son id. */
function columnKeys(columns: TableColumnInfo[]): Map<string, string> {
  const counts = new Map<string, number>();
  for (const column of columns) {
    counts.set(column.name, (counts.get(column.name) ?? 0) + 1);
  }
  return new Map(
    columns.map((column) => [
      column.id,
      (counts.get(column.name) ?? 0) > 1 || column.name === "rowId"
        ? `${column.name} (${column.id})`
        : column.name,
    ]),
  );
}

function tsvValue(value: TableCellValue): string {
  if (value === null) return "";
  if (Array.isArray(value)) return value.join("; ");
  if (typeof value === "object") {
    return "href" in value ? value.href : (value.title ?? value.nodeId);
  }
  return String(value);
}

function jsonValue(column: TableColumnInfo, value: TableCellValue): unknown {
  if (Array.isArray(value) && !column.isMulti) return value[0] ?? null;
  return value;
}

export const tableCommand: CliCommand = {
  name: "table",
  summary: "print every row of a table (TSV with header, or JSONL)",
  help: HELP,
  async run(args, { run, scope }) {
    const parsed = parseArgs(args, {
      options: ["columns", "format"],
      flags: ["schema"],
    });
    if ("error" in parsed) return fail(`nole table: ${parsed.error}`, 2);
    if (parsed.flags.has("help")) return ok(HELP);
    if (parsed.positionals.length !== 1) {
      return fail(`nole table: give exactly one table id`, 2);
    }
    const format = option(parsed, "format") ?? "tsv";
    if (format !== "tsv" && format !== "jsonl") {
      return fail(`nole table: --format must be tsv or jsonl`, 2);
    }

    const result = await readTable(run, scope, parsed.positionals[0]);
    if (!result.ok) return fail(`nole table: ${result.error}`);
    const { table } = result;

    if (parsed.flags.has("schema")) {
      if (format === "jsonl") {
        return ok(
          table.columns
            .map((column) =>
              JSON.stringify({
                id: column.id,
                name: column.name,
                type: column.type,
                isMulti: column.isMulti,
                options: column.options.map((option) => option.label),
              }),
            )
            .join("\n"),
        );
      }
      return ok(
        table.columns
          .map((column) =>
            [
              column.id,
              column.name,
              column.type === "select" && column.isMulti
                ? "select (multi)"
                : column.type,
              column.options.map((option) => option.label).join("; "),
            ]
              .map(tsvField)
              .join("\t"),
          )
          .join("\n"),
      );
    }

    const keys = columnKeys(table.columns);
    let columns = table.columns;
    const wanted = option(parsed, "columns");
    if (wanted) {
      const picked: TableColumnInfo[] = [];
      for (const name of wanted.split(",").map((part) => part.trim())) {
        const column = table.columns.find(
          (candidate) =>
            candidate.id === name ||
            candidate.name === name ||
            keys.get(candidate.id) === name,
        );
        if (!column) {
          return fail(
            `nole table: no column "${name}" (columns: ${table.columns.map((candidate) => keys.get(candidate.id)).join(", ")})`,
            2,
          );
        }
        picked.push(column);
      }
      columns = picked;
    }

    if (format === "jsonl") {
      return ok(
        table.rows
          .map((row) =>
            JSON.stringify({
              rowId: row.id,
              ...Object.fromEntries(
                columns.map((column) => [
                  keys.get(column.id),
                  jsonValue(column, row.cells[column.id]),
                ]),
              ),
            }),
          )
          .join("\n"),
      );
    }

    const header = ["rowId", ...columns.map((column) => keys.get(column.id)!)];
    const lines = table.rows.map((row) =>
      [row.id, ...columns.map((column) => tsvValue(row.cells[column.id]))]
        .map(tsvField)
        .join("\t"),
    );
    return ok([header.map(tsvField).join("\t"), ...lines].join("\n"));
  },
};
