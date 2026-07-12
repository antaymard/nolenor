import {type Doc} from "../../_generated/dataModel";
import {plateJsonToMarkdown} from "./plateMarkdownConverter";
import {parseStoredPlateDocument} from "../../lib/plateDocumentStorage";

type SelectOption = {
  id: string;
  label: string;
  color?: string;
};

type TableColumn = {
  id: string;
  name: string;
  type?: string;
  options?: Array<SelectOption>;
  isMulti?: boolean;
};

type TableRow = {
  id: string;
  cells?: Record<string, unknown>;
};

type StoredTableValue = {
  columns?: Array<TableColumn>;
  rows?: Array<TableRow>;
};

export type TableRowSlice = {
  offset?: number;
  limit?: number;
  rowIds?: string[];
};

export type TableFormatOptions = {
  rowSlice?: TableRowSlice;
  nodeInfoById?: Map<string, { type: string; title: string }>;
  defaultRowLimit?: number;
  maxRowLimit?: number;
  maxChars?: number;
  includeColumnLegend?: boolean;
};

export type TableTruncationReason =
  | "defaultCap"
  | "hardCap"
  | "charLimit"
  | null;

export type TableFormatResult = {
  markdown: string;
  totalRows: number;
  displayedRowIds: string[];
  truncated: boolean;
  truncationReason: TableTruncationReason;
  missingRowIds: string[];
};

function escapeMarkdownTableCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
}

function stringifySelectCell(rawValue: unknown, column: TableColumn): string {
  const ids = Array.isArray(rawValue)
    ? rawValue.filter((id): id is string => typeof id === "string")
    : typeof rawValue === "string" && rawValue.length > 0
      ? [rawValue]
      : [];

  if (ids.length === 0) return "";

  const optionMap = new Map(
    (column.options ?? []).map((opt) => [opt.id, opt] as const),
  );

  return ids
    .map((id) => {
      const opt = optionMap.get(id);
      if (!opt) return id;
      return `${opt.label} (${opt.id})`;
    })
    .join(", ");
}

function stringifyNodeCell(
  rawValue: unknown,
  nodeInfoById?: Map<string, { type: string; title: string }>,
): string {
  if (!rawValue || typeof rawValue !== "object") return "";
  const nodeId = (rawValue as { nodeId?: unknown }).nodeId;
  if (typeof nodeId !== "string" || nodeId.length === 0) return "";

  const info = nodeInfoById?.get(nodeId);
  if (!info) return `${nodeId} | unknown | (not found)`;

  return `${nodeId} | ${info.type} | ${info.title}`;
}

function stringifyTableCellValue(
  value: unknown,
  column: TableColumn,
  nodeInfoById?: Map<string, { type: string; title: string }>,
): string {
  if (value === null || value === undefined) return "";

  if (column.type === "select") {
    return stringifySelectCell(value, column);
  }

  if (column.type === "node") {
    return stringifyNodeCell(value, nodeInfoById);
  }

  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (typeof value === "object") {
    const maybeLink = value as {
      href?: unknown;
      pageTitle?: unknown;
    };
    if (typeof maybeLink.href === "string") {
      const title =
        typeof maybeLink.pageTitle === "string" &&
        maybeLink.pageTitle.length > 0
          ? maybeLink.pageTitle
          : maybeLink.href;
      return `[${title}](${maybeLink.href})`;
    }
    return JSON.stringify(value);
  }

  return String(value);
}

function buildColumnLegend(columns: TableColumn[]): string {
  if (columns.length === 0) return "";

  const lines = columns.map((col) => {
    const name = col.name || col.id;
    const parts: string[] = [`- ${col.id} (${col.type ?? "text"}`];
    if (col.type === "select") {
      parts[0] += col.isMulti ? ", multi" : ", single";
    }
    parts[0] += `): ${name}`;

    if (col.type === "select" && col.options && col.options.length > 0) {
      const optionsList = col.options
        .map((opt) => `${opt.label}=${opt.id}`)
        .join(", ");
      parts.push(`    options: ${optionsList}`);
    }

    return parts.join("\n");
  });

  return [
    "",
    "Column IDs (use these IDs for table_insert_rows and table_update_rows):",
    ...lines,
  ].join("\n");
}

type RowSelection = {
  selected: TableRow[];
  truncationReason: "defaultCap" | "hardCap" | null;
  missingRowIds: string[];
};

function selectRows({
  rows,
  rowSlice,
  defaultRowLimit,
  maxRowLimit,
}: {
  rows: TableRow[];
  rowSlice: TableRowSlice | undefined;
  defaultRowLimit: number | undefined;
  maxRowLimit: number | undefined;
}): RowSelection {
  const requestedRowIds = rowSlice?.rowIds;
  if (requestedRowIds && requestedRowIds.length > 0) {
    const rowById = new Map(rows.map((row) => [row.id, row] as const));
    const selected: TableRow[] = [];
    const missing: string[] = [];
    for (const id of requestedRowIds) {
      const row = rowById.get(id);
      if (row) selected.push(row);
      else missing.push(id);
    }

    let capped = selected;
    let truncationReason: "hardCap" | null = null;
    if (typeof maxRowLimit === "number" && capped.length > maxRowLimit) {
      capped = capped.slice(0, maxRowLimit);
      truncationReason = "hardCap";
    }

    return { selected: capped, truncationReason, missingRowIds: missing };
  }

  const offset = Math.max(0, Math.floor(rowSlice?.offset ?? 0));
  const requestedLimit = rowSlice?.limit;
  const hasExplicitLimit =
    typeof requestedLimit === "number" && Number.isFinite(requestedLimit);

  const effectiveLimit = hasExplicitLimit
    ? Math.max(0, Math.floor(requestedLimit as number))
    : defaultRowLimit;

  const cappedLimit =
    typeof effectiveLimit === "number"
      ? typeof maxRowLimit === "number"
        ? Math.min(effectiveLimit, maxRowLimit)
        : effectiveLimit
      : undefined;

  const slice =
    typeof cappedLimit === "number"
      ? rows.slice(offset, offset + cappedLimit)
      : rows.slice(offset);

  const remainingFromOffset = Math.max(0, rows.length - offset);
  const limitCappedRequest =
    hasExplicitLimit &&
    typeof maxRowLimit === "number" &&
    (requestedLimit as number) > maxRowLimit &&
    slice.length < remainingFromOffset;
  const defaultCapApplied =
    !hasExplicitLimit && slice.length < remainingFromOffset;

  const truncationReason: "hardCap" | "defaultCap" | null = limitCappedRequest
    ? "hardCap"
    : defaultCapApplied
      ? "defaultCap"
      : null;

  return {
    selected: slice,
    truncationReason,
    missingRowIds: [],
  };
}

export function formatTableMarkdown(
  tableValue: unknown,
  options?: TableFormatOptions,
): TableFormatResult {
  const table = (tableValue ?? {}) as StoredTableValue;
  const columns = Array.isArray(table.columns) ? table.columns : [];
  const rows = Array.isArray(table.rows) ? table.rows : [];

  const includeColumnLegend = options?.includeColumnLegend ?? true;
  const nodeInfoById = options?.nodeInfoById;

  if (columns.length === 0 && rows.length === 0) {
    return {
      markdown: "(tableau vide)",
      totalRows: 0,
      displayedRowIds: [],
      truncated: false,
      truncationReason: null,
      missingRowIds: [],
    };
  }

  const selection = selectRows({
    rows,
    rowSlice: options?.rowSlice,
    defaultRowLimit: options?.defaultRowLimit,
    maxRowLimit: options?.maxRowLimit,
  });

  const headers = ["_rowId", ...columns.map((col) => col.name || col.id)];
  const headerRow = `| ${headers.map(escapeMarkdownTableCell).join(" | ")} |`;
  const separatorRow = `| ${headers.map(() => "---").join(" | ")} |`;

  const buildBodyRow = (row: TableRow): string => {
    const cells = columns.map((col) => {
      const rawValue = row.cells?.[col.id];
      return escapeMarkdownTableCell(
        stringifyTableCellValue(rawValue, col, nodeInfoById),
      );
    });
    const rowId = escapeMarkdownTableCell(row.id ?? "");
    return `| ${[rowId, ...cells].join(" | ")} |`;
  };

  const maxChars = options?.maxChars;
  const accepted: TableRow[] = [];
  const acceptedRowLines: string[] = [];
  let truncatedByChars = false;
  let runningChars = headerRow.length + separatorRow.length + 2;

  for (const row of selection.selected) {
    const line = buildBodyRow(row);
    if (
      typeof maxChars === "number" &&
      runningChars + line.length + 1 > maxChars &&
      accepted.length > 0
    ) {
      truncatedByChars = true;
      break;
    }
    accepted.push(row);
    acceptedRowLines.push(line);
    runningChars += line.length + 1;
  }

  const tableMarkdown =
    accepted.length === 0
      ? (() => {
          const emptyCells = ["*(no rows)*", ...columns.map(() => "")];
          return [
            headerRow,
            separatorRow,
            `| ${emptyCells.map(escapeMarkdownTableCell).join(" | ")} |`,
          ].join("\n");
        })()
      : [headerRow, separatorRow, ...acceptedRowLines].join("\n");

  const legend = includeColumnLegend ? buildColumnLegend(columns) : "";
  const markdown = `${tableMarkdown}${legend}`;

  const truncationReason: TableTruncationReason = truncatedByChars
    ? "charLimit"
    : selection.truncationReason;

  return {
    markdown,
    totalRows: rows.length,
    displayedRowIds: accepted.map((row) => row.id),
    truncated: truncatedByChars || selection.truncationReason !== null,
    truncationReason,
    missingRowIds: selection.missingRowIds,
  };
}

export function makeTableNodeDataLLMFriendly(
  tableValue: unknown,
  titleValue?: unknown,
): string {
  const result = formatTableMarkdown(tableValue);
  const title =
    typeof titleValue === "string" && titleValue.trim().length > 0
      ? titleValue.trim()
      : null;

  if (title) {
    return `### ${title}\n\n${result.markdown}`;
  }

  return result.markdown;
}

/**
 * Formate les values d'un seul nodeData en markdown lisible pour un LLM.
 * Convertit notamment le contenu PlateJS des nodes `document` en markdown.
 */
export async function makeNodeDataLLMFriendly(
  nodeData: Doc<"nodeDatas">,
): Promise<string> {
  const values = nodeData.values;

  switch (nodeData.type) {
    case "document": {
      const doc = values.doc;
      const parsedDoc = parseStoredPlateDocument(doc);
      if (parsedDoc) {
        return await plateJsonToMarkdown(parsedDoc);
      }
      return typeof doc === "string" ? doc : JSON.stringify(doc);
    }

    case "value": {
      const val = values.value;
      if (!val) return "(aucune valeur)";
      const parts: string[] = [];
      if (val.label) parts.push(`**${val.label}** :`);
      parts.push(String(val.value));
      if (val.unit) parts.push(val.unit);
      return parts.join(" ");
    }

    case "link": {
      const link = values.link;
      if (!link) return "(aucun lien)";
      return `[${link.pageTitle || link.href}](${link.href})`;
    }

    case "image": {
      const images = values.images as Array<{ url: string }> | undefined;
      if (!images || images.length === 0) return "(aucune image)";
      return images.map((img) => `![image](${img.url})`).join("\n");
    }

    case "title": {
      const text = values.text ?? "";
      const level = values.level as string | undefined;
      const prefix =
        level === "h1"
          ? "# "
          : level === "h2"
            ? "## "
            : level === "h3"
              ? "### "
              : "";
      return `${prefix}${text}`;
    }

    case "pdf": {
      const files = values.files as
        | Array<{ url: string; filename: string; mimeType?: string }>
        | undefined;
      if (!files || files.length === 0) return "(aucun fichier)";
      return files
        .map(
          (f) =>
            `- [${f.filename}](${f.url})${f.mimeType ? ` (${f.mimeType})` : ""}`,
        )
        .join("\n");
    }

    case "table": {
      return makeTableNodeDataLLMFriendly(values.table, values.title);
    }

    case "app": {
      const code = typeof values.code === "string" ? values.code : "";
      const state = values.state ?? null;
      const errors = Array.isArray(values.errors)
        ? (values.errors as Array<{
            type?: string;
            message?: string;
            stack?: string;
            source?: string;
            line?: number;
            col?: number;
            timestamp?: number;
          }>)
        : [];

      const parts: string[] = [];
      parts.push("```jsx\n" + code + "\n```");
      parts.push(`state: ${JSON.stringify(state)}`);
      if (errors.length > 0) {
        const formatted = errors
          .map((e, i) => {
            const head = `[${i + 1}] (${e.type ?? "error"}) ${e.message ?? ""}`;
            const loc =
              e.source || typeof e.line === "number"
                ? `\n  at ${e.source ?? ""}:${e.line ?? ""}:${e.col ?? ""}`
                : "";
            const stack = e.stack ? `\n${e.stack}` : "";
            return `${head}${loc}${stack}`;
          })
          .join("\n\n");
        parts.push(
          `runtime errors (most recent first ${errors.length}/10, captured from the iframe):\n${formatted}`,
        );
      } else {
        parts.push("runtime errors: (none captured)");
      }
      return parts.join("\n\n");
    }

    default:
      return JSON.stringify(values);
  }
}
