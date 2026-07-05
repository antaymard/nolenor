import { createTool } from "@convex-dev/agent";
import { z } from "zod";
import { toolAgentNames, type ThreadCtx } from "../agentConfig";
import { internal } from "../../_generated/api";
import { Id } from "../../_generated/dataModel";
import {
  cellValueSchema,
  normalizeCellValueForColumn,
  type TableColumn,
} from "../helpers/tableCellValidation";
import { toolError, ToolConfig } from "./toolHelpers";

// Tool compaction config
export const tableUpdateRowsToolConfig: ToolConfig = {
  name: "table_update_rows",
  authorized_agents: [
    toolAgentNames.nole,
    toolAgentNames.clone,
    toolAgentNames.supervisor,
    toolAgentNames.worker,
  ],
  mcp: { access: "editor" },
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
const ERROR_TABLE_SCHEMA_EMPTY = toolError(
  "Table schema is empty. Use table_update_schema first (operation: set or add_column) before updating rows.",
);

const rowValuesByColumnIdSchema = z
  .record(z.string().min(1), cellValueSchema)
  .refine((row) => Object.keys(row).length > 0, {
    message: "Each row update must contain at least one column value.",
  });

const valuesByRowIdSchema = z
  .record(z.string().min(1), rowValuesByColumnIdSchema)
  .refine((updates) => Object.keys(updates).length > 0, {
    message: "values must contain at least one row update.",
  });

export default function tableUpdateRowsTool({
  threadCtx,
}: {
  threadCtx: ThreadCtx;
}) {
  const { canvasId } = threadCtx;

  return createTool({
    description:
      "Update one or multiple existing rows in a table node from the current canvas. " +
      "For select columns, value can be an option id, label, or array of those (when isMulti=true). " +
      'For node columns, value can be a nodeId string or { "nodeId": "..." } object.',
    inputSchema: z.object({
      nodeId: z.string().describe("The node ID in the current canvas."),
      values: valuesByRowIdSchema.describe(
        'Row updates in this format: `{"rowId":{"columnId":value}}`. Example: `{"588P493x":{"description":"Contenu embarque"},"412Z233E":{"type":"Document","color":"Navy"}}`.',
      ),
      explanation: z.string().describe("3-5 words explaining the edit intent."),
    }),
    execute: async (ctx, input): Promise<string> => {
      console.log(`🧮 Table rows update requested on node ${input.nodeId}`);

      try {
        const { nodeId } = input;

        const requestedEntries = Object.entries(input.values).map(
          ([rawRowId, rowValues]) => ({
            rawRowId,
            rowId: rawRowId.trim(),
            rowValues,
          }),
        );

        const emptyRowId = requestedEntries.find(
          (entry) => entry.rowId.length === 0,
        );
        if (emptyRowId) {
          return toolError("rowId must be a non-empty string.");
        }

        const duplicateRequestedRowId = requestedEntries.find(
          (entry, index) =>
            requestedEntries.findIndex(
              (candidate) => candidate.rowId === entry.rowId,
            ) !== index,
        );
        if (duplicateRequestedRowId) {
          return toolError(
            `rowId "${duplicateRequestedRowId.rawRowId}" is provided multiple times.`,
          );
        }

        const { node, nodeData } = await ctx.runQuery(
          internal.wrappers.canvasNodeWrappers.getNodeWithNodeData,
          {
            canvasId,
            nodeId,
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

        if (columns.length === 0) {
          return ERROR_TABLE_SCHEMA_EMPTY;
        }

        const needsCanvasNodeIds = columns.some((col) => col.type === "node");
        const knownCanvasNodeIds = new Set<string>();
        if (needsCanvasNodeIds) {
          const { nodes: canvasNodes } = await ctx.runQuery(
            internal.wrappers.canvasNodeWrappers.getCanvasNodesAndEdges,
            {
              canvasId: canvasId as Id<"canvases">,
            },
          );
          for (const cn of canvasNodes) {
            knownCanvasNodeIds.add(cn.id);
          }
        }

        for (const entry of requestedEntries) {
          const rowMatches = rows.filter(
            (row) => (row.id ?? "").trim() === entry.rowId,
          );
          if (rowMatches.length === 0) {
            return toolError(`No match found for rowId "${entry.rawRowId}".`);
          }
          if (rowMatches.length > 1) {
            return toolError(
              `Found ${rowMatches.length} matches for rowId "${entry.rawRowId}". Please provide a unique rowId.`,
            );
          }
        }

        const updatesByRowId = new Map<
          string,
          Array<{ columnId: string; value: unknown }>
        >();

        for (const entry of requestedEntries) {
          const resolvedUpdates: Array<{ columnId: string; value: unknown }> =
            [];

          for (const [rawColumnId, rawValue] of Object.entries(
            entry.rowValues,
          )) {
            const columnId = rawColumnId.trim();
            if (!columnId) {
              return toolError("columnId must be a non-empty string.");
            }

            const matchedColumns = columns.filter(
              (column) => column.id.trim() === columnId,
            );

            if (matchedColumns.length === 0) {
              return toolError(`No match found for columnId "${rawColumnId}".`);
            }
            if (matchedColumns.length > 1) {
              return toolError(
                `Found ${matchedColumns.length} matches for columnId "${rawColumnId}". Please provide a unique column id.`,
              );
            }

            const matchedColumn = matchedColumns[0];

            const duplicate = resolvedUpdates.some(
              (existing) => existing.columnId === matchedColumn.id,
            );
            if (duplicate) {
              return toolError(
                `Column "${matchedColumn.name}" is provided multiple times.`,
              );
            }

            const normalized = normalizeCellValueForColumn({
              rawValue,
              column: matchedColumn,
              ctx: { knownCanvasNodeIds },
            });
            if (!normalized.ok) {
              return normalized.error;
            }

            resolvedUpdates.push({
              columnId: matchedColumn.id,
              value: normalized.value,
            });
          }

          updatesByRowId.set(entry.rowId, resolvedUpdates);
        }

        const updatedRows = rows.map((row) => {
          const rowId = (row.id ?? "").trim();
          const rowUpdates = updatesByRowId.get(rowId);

          if (!rowUpdates) {
            return row;
          }

          const nextCells: Record<string, unknown> = {
            ...(row.cells ?? {}),
          };

          for (const update of rowUpdates) {
            nextCells[update.columnId] = update.value;
          }

          return {
            ...row,
            cells: nextCells,
          };
        });

        await ctx.runMutation(internal.wrappers.nodeDataWrappers.updateValues, {
          _id: nodeData._id,
          values: {
            ...nodeData.values,
            table: {
              ...tableValue,
              columns,
              rows: updatedRows,
            },
          },
          actor: {
            type: "agent",
            userId: threadCtx.authUserId,
            threadId: ctx.threadId,
          },
        });

        console.log(
          `✅ Table row update complete for node ${nodeId} (${requestedEntries.length} row(s))`,
        );

        const updatedCellsCount = Array.from(updatesByRowId.values()).reduce(
          (count, updates) => count + updates.length,
          0,
        );

        return `Successfully updated ${requestedEntries.length} rows and ${updatedCellsCount} cells.`;
      } catch (error) {
        console.error("Table update rows tool error:", error);
        return toolError(
          error instanceof Error ? error.message : String(error),
        );
      }
    },
  });
}
