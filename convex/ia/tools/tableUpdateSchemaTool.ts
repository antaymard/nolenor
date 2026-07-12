import {createTool} from "@convex-dev/agent";
import {z} from "zod";
import {toolAgentNames, type ThreadCtx} from "../agentConfig";
import {internal} from "../../_generated/api";
import {generateLlmId} from "../../lib/llmId";
import {type ToolConfig, toolError} from "./toolHelpers";

// Tool compaction config
export const tableUpdateSchemaToolConfig: ToolConfig = {
  name: "table_update_schema",
  authorized_agents: [
    toolAgentNames.nole,
    toolAgentNames.clone,
    toolAgentNames.supervisor,
    toolAgentNames.worker,
  ],
};

const SELECT_COLORS = [
  "gray",
  "red",
  "orange",
  "amber",
  "yellow",
  "lime",
  "green",
  "emerald",
  "teal",
  "cyan",
  "sky",
  "blue",
  "indigo",
  "violet",
  "purple",
  "fuchsia",
  "pink",
  "rose",
] as const;

type SelectColor = (typeof SELECT_COLORS)[number];

type TableColumnType =
  | "text"
  | "number"
  | "checkbox"
  | "date"
  | "link"
  | "select"
  | "node";

type SelectOption = {
  id: string;
  label: string;
  color: SelectColor;
};

type TableColumn = {
  id: string;
  name: string;
  type: TableColumnType;
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

const ERROR_TARGET_NOT_TABLE = toolError("Target node must be a table.");
const ERROR_INVALID_TABLE_CONTENT = toolError(
  "Table content is not valid (expected table.columns and table.rows arrays).",
);

const columnTypeSchema = z.enum([
  "text",
  "number",
  "checkbox",
  "date",
  "link",
  "select",
  "node",
]);

const selectColorSchema = z.enum(SELECT_COLORS);

const selectOptionInputSchema = z.object({
  id: z
    .string()
    .min(1)
    .optional()
    .describe("Optional option id. If omitted, one is generated from label."),
  label: z.string().min(1).describe("Option display label."),
  color: selectColorSchema
    .optional()
    .describe(
      `Option color tag. Defaults to "gray" if omitted. Allowed: ${SELECT_COLORS.join(", ")}.`,
    ),
});

const columnInputSchema = z.object({
  id: z
    .string()
    .min(1)
    .optional()
    .describe("Optional column id. If omitted, one is generated."),
  name: z.string().min(1).describe("Column display name."),
  type: columnTypeSchema.describe("Column type."),
  options: z
    .array(selectOptionInputSchema)
    .optional()
    .describe(
      "For select columns: list of available options. Ignored for other types.",
    ),
  isMulti: z
    .boolean()
    .optional()
    .describe(
      "For select columns: whether multiple options can be selected per cell. Defaults to false. Ignored for other types.",
    ),
});

const operationSchema = z.enum([
  "set",
  "add_column",
  "update_column",
  "delete_column",
]);

const updateColumnPayloadSchema = z.object({
  identifier: z
    .string()
    .min(1)
    .describe("Existing column id or name to update."),
  name: z.string().min(1).optional().describe("New display name."),
  options: z
    .array(selectOptionInputSchema)
    .optional()
    .describe(
      "For select columns: replace the options list. Existing cell values referencing removed option ids will be cleaned automatically.",
    ),
  isMulti: z
    .boolean()
    .optional()
    .describe("For select columns: change the isMulti flag."),
});

function normalizeLookupKey(value: string): string {
  return value.trim().toLowerCase();
}

function removeSpaces(value: string): string {
  return value.replace(/\s+/g, "");
}

function buildColumnId(name: string): string {
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (normalized.length > 0) {
    return normalized;
  }

  return generateLlmId();
}

function buildOptionId(label: string): string {
  const normalized = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (normalized.length > 0) {
    return normalized;
  }

  return generateLlmId();
}

function normalizeSelectOptions(
  rawOptions: Array<z.infer<typeof selectOptionInputSchema>>,
): { ok: true; options: Array<SelectOption> } | { ok: false; error: string } {
  const seenIds = new Set<string>();
  const seenLabels = new Set<string>();
  const result: Array<SelectOption> = [];

  for (const raw of rawOptions) {
    const label = raw.label.trim();
    const id = raw.id?.trim() || buildOptionId(label);
    const color = raw.color ?? "gray";

    const normalizedId = normalizeLookupKey(id);
    const normalizedLabel = normalizeLookupKey(label);

    if (seenIds.has(normalizedId)) {
      return { ok: false, error: toolError(`Duplicate option id "${id}".`) };
    }
    if (seenLabels.has(normalizedLabel)) {
      return {
        ok: false,
        error: toolError(`Duplicate option label "${label}".`),
      };
    }

    seenIds.add(normalizedId);
    seenLabels.add(normalizedLabel);
    result.push({ id, label, color });
  }

  return { ok: true, options: result };
}

function buildColumnFromInput(
  raw: z.infer<typeof columnInputSchema>,
): { ok: true; column: TableColumn } | { ok: false; error: string } {
  const name = raw.name.trim();
  const id = raw.id?.trim() || buildColumnId(name);
  const base: TableColumn = { id, name, type: raw.type };

  if (raw.type === "select") {
    if (raw.options && raw.options.length > 0) {
      const normalized = normalizeSelectOptions(raw.options);
      if (!normalized.ok) return normalized;
      base.options = normalized.options;
    } else {
      base.options = [];
    }
    base.isMulti = raw.isMulti ?? false;
  } else if (raw.options !== undefined || raw.isMulti !== undefined) {
    return {
      ok: false,
      error: toolError(
        `options and isMulti are only valid for select columns (got type "${raw.type}").`,
      ),
    };
  }

  return { ok: true, column: base };
}

function resolveColumnMatches({
  columns,
  identifier,
}: {
  columns: Array<TableColumn>;
  identifier: string;
}): Array<TableColumn> {
  const normalized = normalizeLookupKey(identifier);
  const noSpaces = removeSpaces(normalized);

  return columns.filter(
    (column) =>
      column.id === identifier ||
      normalizeLookupKey(column.id) === normalized ||
      normalizeLookupKey(column.name) === normalized ||
      removeSpaces(normalizeLookupKey(column.id)) === noSpaces ||
      removeSpaces(normalizeLookupKey(column.name)) === noSpaces,
  );
}

function validateNoDuplicateColumns(
  columns: Array<TableColumn>,
): string | null {
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();

  for (const column of columns) {
    const normalizedId = normalizeLookupKey(column.id);
    const normalizedName = normalizeLookupKey(column.name);

    if (seenIds.has(normalizedId)) {
      return toolError(`Duplicate column id "${column.id}".`);
    }
    if (seenNames.has(normalizedName)) {
      return toolError(`Duplicate column name "${column.name}".`);
    }

    seenIds.add(normalizedId);
    seenNames.add(normalizedName);
  }

  return null;
}

function pruneSelectOptionValues({
  rows,
  columnId,
  validOptionIds,
}: {
  rows: TableRow[];
  columnId: string;
  validOptionIds: Set<string>;
}): TableRow[] {
  return rows.map((row) => {
    const cell = row.cells?.[columnId];
    if (cell === undefined) return row;

    if (Array.isArray(cell)) {
      const next = cell.filter(
        (id) => typeof id === "string" && validOptionIds.has(id),
      );
      if (next.length === cell.length) return row;
      return {
        ...row,
        cells: { ...(row.cells ?? {}), [columnId]: next },
      };
    }

    if (typeof cell === "string" && !validOptionIds.has(cell)) {
      const nextCells = { ...(row.cells ?? {}) };
      delete nextCells[columnId];
      return { ...row, cells: nextCells };
    }

    return row;
  });
}

export default function tableUpdateSchemaTool({
  threadCtx,
}: {
  threadCtx: ThreadCtx;
}) {
  const { canvasId } = threadCtx;

  return createTool({
    description:
      "Update table schema (columns) on a table node. Supports types: text, number, checkbox, date, link, select (with options + isMulti), node (references a canvas node). " +
      "Operations: set (only when schema is empty), add_column, update_column (rename / change select options or isMulti), delete_column.",
    inputSchema: z.object({
      nodeId: z.string().describe("The node ID in the current canvas."),
      operation: operationSchema.describe(
        "Operation to apply: set (only when schema is empty), add_column, update_column, or delete_column.",
      ),
      deleteColumnsValues: z
        .boolean()
        .optional()
        .describe(
          "For delete_column only. If true, remove deleted columns values from all rows. If false, deletion is blocked when values exist.",
        ),
      payload: z
        .object({
          columns: z
            .array(columnInputSchema)
            .optional()
            .describe("For set: full schema columns list."),
          column: columnInputSchema
            .optional()
            .describe("For add_column: one column to add."),
          updateColumn: updateColumnPayloadSchema
            .optional()
            .describe(
              "For update_column: target column and the fields to change.",
            ),
          columnIdentifiers: z
            .array(z.string().min(1))
            .optional()
            .describe("For delete_column: column id(s) or name(s) to delete."),
        })
        .describe("Operation payload."),
      explanation: z.string().describe("3-5 words explaining the edit intent."),
    }),
    execute: async (ctx, input): Promise<string> => {
      console.log(
        `🧮 Table schema update requested on node ${input.nodeId} (${input.operation})`,
      );

      try {
        const { node, nodeData } = await ctx.runQuery(
          internal.wrappers.canvasNodeWrappers.getNodeWithNodeData,
          {
            canvasId,
            nodeId: input.nodeId,
          },
        );

        if (node.type !== "table" || nodeData.type !== "table") {
          return ERROR_TARGET_NOT_TABLE;
        }

        const tableValue = (nodeData.values.table ?? {}) as StoredTableValue;
        const columns = Array.isArray(tableValue.columns)
          ? tableValue.columns
          : null;
        const rows = Array.isArray(tableValue.rows) ? tableValue.rows : null;

        if (!columns || !rows) {
          return ERROR_INVALID_TABLE_CONTENT;
        }

        if (input.operation === "set") {
          const inputColumns = input.payload.columns;
          if (!inputColumns || inputColumns.length === 0) {
            return toolError(
              "payload.columns is required for set and must contain at least one column.",
            );
          }

          if (columns.length > 0) {
            return toolError("set is allowed only when table schema is empty.");
          }

          if (rows.length > 0) {
            return toolError(
              "set is allowed only when table schema is empty (no columns and no rows).",
            );
          }

          const nextColumns: Array<TableColumn> = [];
          for (const raw of inputColumns) {
            const built = buildColumnFromInput(raw);
            if (!built.ok) return built.error;
            nextColumns.push(built.column);
          }

          const duplicatesError = validateNoDuplicateColumns(nextColumns);
          if (duplicatesError) {
            return duplicatesError;
          }

          await ctx.runMutation(
            internal.wrappers.nodeDataWrappers.updateValues,
            {
              _id: nodeData._id,
              values: {
                ...nodeData.values,
                table: {
                  ...tableValue,
                  columns: nextColumns,
                  rows,
                },
              },
              actor: {
                type: "agent",
                userId: threadCtx.authUserId,
                threadId: ctx.threadId,
              },
            },
          );

          return `Successfully set table schema with ${nextColumns.length} columns.`;
        }

        if (input.operation === "add_column") {
          const inputColumn = input.payload.column;
          if (!inputColumn) {
            return toolError("payload.column is required for add_column.");
          }

          const built = buildColumnFromInput(inputColumn);
          if (!built.ok) return built.error;

          const nextColumns = [...columns, built.column];
          const duplicatesError = validateNoDuplicateColumns(nextColumns);
          if (duplicatesError) {
            return duplicatesError;
          }

          await ctx.runMutation(
            internal.wrappers.nodeDataWrappers.updateValues,
            {
              _id: nodeData._id,
              values: {
                ...nodeData.values,
                table: {
                  ...tableValue,
                  columns: nextColumns,
                  rows,
                },
              },
              actor: {
                type: "agent",
                userId: threadCtx.authUserId,
                threadId: ctx.threadId,
              },
            },
          );

          return `Successfully added column "${built.column.name}".`;
        }

        if (input.operation === "update_column") {
          const update = input.payload.updateColumn;
          if (!update) {
            return toolError(
              "payload.updateColumn is required for update_column.",
            );
          }

          const matches = resolveColumnMatches({
            columns,
            identifier: update.identifier,
          });
          if (matches.length === 0) {
            return toolError(
              `No match found for column "${update.identifier}".`,
            );
          }
          if (matches.length > 1) {
            return toolError(
              `Found ${matches.length} matches for column "${update.identifier}". Please use a unique id.`,
            );
          }

          const target = matches[0];

          const isOptionsUpdate = update.options !== undefined;
          const isMultiUpdate = update.isMulti !== undefined;

          if (
            (isOptionsUpdate || isMultiUpdate) &&
            target.type !== "select"
          ) {
            return toolError(
              `options and isMulti can only be set on select columns (column "${target.name}" is type "${target.type}").`,
            );
          }

          let nextOptions = target.options;
          let prunedRows = rows;

          if (isOptionsUpdate) {
            const normalized = normalizeSelectOptions(update.options ?? []);
            if (!normalized.ok) return normalized.error;
            nextOptions = normalized.options;

            const validOptionIds = new Set(
              nextOptions.map((opt) => opt.id),
            );
            prunedRows = pruneSelectOptionValues({
              rows,
              columnId: target.id,
              validOptionIds,
            });
          }

          const updatedColumn: TableColumn = {
            ...target,
            name: update.name?.trim() || target.name,
            options: nextOptions,
            isMulti: isMultiUpdate ? update.isMulti : target.isMulti,
          };

          const nextColumns = columns.map((col) =>
            col.id === target.id ? updatedColumn : col,
          );

          const duplicatesError = validateNoDuplicateColumns(nextColumns);
          if (duplicatesError) {
            return duplicatesError;
          }

          await ctx.runMutation(
            internal.wrappers.nodeDataWrappers.updateValues,
            {
              _id: nodeData._id,
              values: {
                ...nodeData.values,
                table: {
                  ...tableValue,
                  columns: nextColumns,
                  rows: prunedRows,
                },
              },
              actor: {
                type: "agent",
                userId: threadCtx.authUserId,
                threadId: ctx.threadId,
              },
            },
          );

          return `Successfully updated column "${updatedColumn.name}".`;
        }

        const identifiers = input.payload.columnIdentifiers;
        if (!identifiers || identifiers.length === 0) {
          return toolError(
            "payload.columnIdentifiers is required for delete_column.",
          );
        }

        const resolvedColumnIds: Array<string> = [];
        const resolvedColumns: Array<TableColumn> = [];

        for (const identifier of identifiers) {
          const matches = resolveColumnMatches({
            columns,
            identifier,
          });

          if (matches.length === 0) {
            return toolError(`No match found for column "${identifier}".`);
          }
          if (matches.length > 1) {
            return toolError(
              `Found ${matches.length} matches for column "${identifier}". Please use a unique id.`,
            );
          }

          const matchedColumn = matches[0];
          if (resolvedColumnIds.includes(matchedColumn.id)) {
            return toolError(
              `Column "${matchedColumn.name}" is provided multiple times.`,
            );
          }

          resolvedColumnIds.push(matchedColumn.id);
          resolvedColumns.push(matchedColumn);
        }

        const shouldDeleteValues = input.deleteColumnsValues ?? false;
        const idsToDelete = new Set(resolvedColumnIds);

        const rowsWithValues = rows.filter((row) => {
          const rowCells = row.cells ?? {};
          return [...idsToDelete].some(
            (columnId) => rowCells[columnId] !== undefined,
          );
        });

        if (!shouldDeleteValues && rowsWithValues.length > 0) {
          return toolError(
            "Some rows contain values for columns to delete. Set deleteColumnsValues=true to remove these values.",
          );
        }

        const nextColumns = columns.filter(
          (column) => !idsToDelete.has(column.id),
        );

        const nextRows =
          shouldDeleteValues && rowsWithValues.length > 0
            ? rows.map((row) => {
                const rowCells = { ...(row.cells ?? {}) };
                for (const columnId of idsToDelete) {
                  delete rowCells[columnId];
                }

                return {
                  ...row,
                  cells: rowCells,
                };
              })
            : rows;

        await ctx.runMutation(internal.wrappers.nodeDataWrappers.updateValues, {
          _id: nodeData._id,
          values: {
            ...nodeData.values,
            table: {
              ...tableValue,
              columns: nextColumns,
              rows: nextRows,
            },
          },
          actor: {
            type: "agent",
            userId: threadCtx.authUserId,
            threadId: ctx.threadId,
          },
        });

        return `Successfully deleted ${resolvedColumns.length} column(s).`;
      } catch (error) {
        console.error("Table update schema tool error:", error);
        return toolError(
          error instanceof Error ? error.message : String(error),
        );
      }
    },
  });
}
