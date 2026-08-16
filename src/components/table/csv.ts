import Papa from "papaparse";
import type {
  CellValue,
  ColumnType,
  LinkCellValue,
  NodeCellValue,
  TableColumn,
  TableRowData,
} from "./types";

// --------------------------------------------------------------------------
// EXPORT
// --------------------------------------------------------------------------

/**
 * Convert a single cell value to a string suitable for a CSV field.
 * Papa Parse handles quoting/escaping of special characters (commas, quotes,
 * newlines), so we just need to produce a faithful string representation.
 */
function cellToCsvString(value: CellValue, type: ColumnType): string {
  if (value == null) return "";

  switch (type) {
    case "checkbox":
      return value ? "true" : "false";
    case "link": {
      // Link cells store an object — export the href which is the canonical value.
      const link = value as LinkCellValue;
      return link.href ?? "";
    }
    case "node": {
      // Nodes are internal references, expose the id so a round-trip is possible.
      const node = value as NodeCellValue;
      return node.nodeId ?? "";
    }
    case "number":
    case "date":
    case "text":
    default:
      return String(value);
  }
}

/**
 * Build the CSV string for the given table.
 *
 * Header row uses the column names verbatim. Papa Parse takes care of escaping
 * any special character (commas, quotes, line breaks) in headers AND cells, so
 * the resulting file round-trips cleanly even with weird column names.
 */
export function buildCsv(
  columns: TableColumn[],
  rows: TableRowData[],
): string {
  const header = columns.map((c) => c.name);
  const data = rows.map((row) =>
    columns.map((col) => cellToCsvString(row.cells[col.id] ?? null, col.type)),
  );
  return Papa.unparse([header, ...data]);
}

/**
 * Trigger a browser download for the given CSV string.
 * Prepends a UTF-8 BOM so Excel opens accentuated characters correctly.
 */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob(["﻿" + csv], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// --------------------------------------------------------------------------
// IMPORT — parsing
// --------------------------------------------------------------------------

export interface ParsedCsv {
  /** Header strings as they appeared in the file (trimmed). */
  headers: string[];
  /** Each row as an ordered array, aligned with `headers`. */
  rows: string[][];
}

/**
 * Parse a CSV file into a header list + rows of strings.
 * Empty trailing rows produced by Papa Parse are dropped.
 */
export function parseCsvFile(file: File): Promise<ParsedCsv> {
  return new Promise((resolve, reject) => {
    Papa.parse<string[]>(file, {
      // We do NOT use `header: true` — we want full control over header naming
      // (incl. duplicates and blank-header handling).
      skipEmptyLines: "greedy",
      complete: (result) => {
        const data = result.data as string[][];
        if (data.length === 0) {
          resolve({ headers: [], rows: [] });
          return;
        }
        const headers = (data[0] ?? []).map((h) => (h ?? "").trim());
        const rows = data.slice(1);
        resolve({ headers, rows });
      },
      error: (err) => reject(err),
    });
  });
}

// --------------------------------------------------------------------------
// IMPORT — type inference
// --------------------------------------------------------------------------

const TRUTHY = new Set(["true", "1", "yes", "y", "oui", "vrai", "x"]);
const FALSY = new Set(["false", "0", "no", "n", "non", "faux", ""]);

function looksLikeNumber(s: string): boolean {
  if (s.trim() === "") return false;
  // Accept comma as decimal separator (common in fr/eu locales).
  const normalized = s.trim().replace(",", ".");
  return !Number.isNaN(Number(normalized)) && Number.isFinite(Number(normalized));
}

function looksLikeBoolean(s: string): boolean {
  const v = s.trim().toLowerCase();
  return TRUTHY.has(v) || FALSY.has(v);
}

function looksLikeDate(s: string): boolean {
  if (s.trim() === "") return false;
  const t = Date.parse(s);
  return !Number.isNaN(t);
}

function looksLikeUrl(s: string): boolean {
  const v = s.trim();
  if (!v) return false;
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Guess the most likely column type by sampling non-empty values.
 *
 * Strategy: every non-empty value must be parseable as the candidate type.
 * The order we test in matters — we go from most specific (link, checkbox)
 * to least specific (text fallback). Numbers are checked before dates because
 * `Date.parse("123")` succeeds and would steal numeric columns otherwise.
 */
export function inferColumnType(samples: string[]): ColumnType {
  const nonEmpty = samples.map((s) => s ?? "").filter((s) => s.trim() !== "");
  if (nonEmpty.length === 0) return "text";

  if (nonEmpty.every(looksLikeUrl)) return "link";
  if (nonEmpty.every(looksLikeBoolean)) return "checkbox";
  if (nonEmpty.every(looksLikeNumber)) return "number";
  if (nonEmpty.every(looksLikeDate)) return "date";
  return "text";
}

// --------------------------------------------------------------------------
// IMPORT — value coercion
// --------------------------------------------------------------------------

/**
 * Convert a raw CSV string to a `CellValue` according to the target column
 * type. Best-effort: anything that cannot be parsed cleanly becomes `null`,
 * rather than corrupting the table with bogus values.
 *
 * NOTE: `node` columns are intentionally not supported as an import target
 * (handled in the dialog by hiding "node" from the type select).
 */
export function coerceCsvValue(raw: string, type: ColumnType): CellValue {
  const s = (raw ?? "").trim();
  if (s === "") return null;

  switch (type) {
    case "text":
      return raw; // keep original (don't trim — user may want trailing spaces)

    case "number": {
      const n = Number(s.replace(",", "."));
      return Number.isFinite(n) ? n : null;
    }

    case "checkbox": {
      const v = s.toLowerCase();
      if (TRUTHY.has(v)) return true;
      if (FALSY.has(v)) return false;
      return null;
    }

    case "date": {
      const t = Date.parse(s);
      if (Number.isNaN(t)) return null;
      // Store as ISO date (YYYY-MM-DD) — that's what the date editor expects.
      return new Date(t).toISOString().slice(0, 10);
    }

    case "link": {
      if (!looksLikeUrl(s)) return null;
      const link: LinkCellValue = { href: s, pageTitle: "" };
      return link;
    }

    case "node":
      // We don't try to resolve node ids from CSV — too brittle.
      return null;

    default:
      return null;
  }
}

// --------------------------------------------------------------------------
// IMPORT — one-shot materialization (no mapping UI)
// --------------------------------------------------------------------------

/** How many values we sample per column when guessing its type. */
const TYPE_INFERENCE_SAMPLE_SIZE = 50;

/**
 * Turn a parsed CSV into a ready-to-store table: one new column per CSV column,
 * named after the header, typed by inference.
 *
 * This is the unattended counterpart of `TableImportDialog` — used when there is
 * no existing table to map onto and no opportunity to ask (dropping a .csv on
 * the canvas). The dialog keeps its own logic because it also has to handle
 * append mode and mapping onto existing columns.
 */
export function buildTableFromParsedCsv(parsed: ParsedCsv): {
  columns: TableColumn[];
  rows: TableRowData[];
} {
  const columnCount = Math.max(
    parsed.headers.length,
    ...parsed.rows.map((row) => row.length),
    0,
  );

  const columns: TableColumn[] = Array.from(
    { length: columnCount },
    (_, csvIndex) => {
      const samples = parsed.rows
        .slice(0, TYPE_INFERENCE_SAMPLE_SIZE)
        .map((row) => row[csvIndex] ?? "");
      return {
        id: crypto.randomUUID(),
        name: parsed.headers[csvIndex] || `Column ${csvIndex + 1}`,
        type: inferColumnType(samples),
      };
    },
  );

  const rows: TableRowData[] = parsed.rows.map((row) => {
    const cells: TableRowData["cells"] = {};
    columns.forEach((col, csvIndex) => {
      cells[col.id] = coerceCsvValue(row[csvIndex] ?? "", col.type);
    });
    return { id: crypto.randomUUID(), cells };
  });

  return { columns, rows };
}
