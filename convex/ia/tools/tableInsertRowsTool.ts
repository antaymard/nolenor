import { createTool } from "@convex-dev/agent";
import { z } from "zod";
import { toolAgentNames, type ThreadCtx } from "../agentConfig";
import { internal } from "../../_generated/api";
import { type Id } from "../../_generated/dataModel";
import { generateLlmId } from "../../lib/llmId";
import {
  cellValueSchema,
  normalizeCellValueForColumn,
  type TableColumn,
} from "../helpers/tableCellValidation";
import { type ToolConfig, toolError } from "./toolHelpers";

// Tool compaction config
export const tableInsertRowsToolConfig: ToolConfig = {
  name: "table_insert_rows",
  authorized_agents: [
    toolAgentNames.nole,
    toolAgentNames.clone,
    toolAgentNames.supervisor,
    toolAgentNames.worker,
  ],
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
  "Table schema is empty. Use table_update_schema first (operation: set or add_column) before inserting rows.",
);

const rowInputSchema = z
  .record(z.string().min(1), cellValueSchema)
  .refine((row) => Object.keys(row).length > 0, {
    message: "Each row must contain at least one column value.",
  })
  .describe(
    'A single row to insert as an object map: { "columnId": value, ... }. ' +
      "For select columns, value can be an option id, label, or array of those (when isMulti=true). " +
      'For node columns, value can be a nodeId string or { "nodeId": "..." } object.',
  );

export default function tableInsertRowsTool({
  threadCtx,
}: {
  threadCtx: ThreadCtx;
}) {
  const { canvasId } = threadCtx;

  return createTool({
    description: "Insert one or multiple rows in a table node.",
    inputSchema: z.object({
      nodeId: z.string().describe("The node ID in the current canvas."),
      anchorRowId: z
        .string()
        .optional()
        .describe(
          "Row id after which new rows are inserted. If empty or omitted, insert at table start.",
        ),
      values: z
        .array(rowInputSchema)
        .min(1)
        .describe(
          'Rows to insert as objects keyed by columnId. Example: `[{"description":"Contenu embarque"},{"type":"Document","color":"Navy"}]`.',
        ),
      explanation: z.string().describe("3-5 words explaining the edit intent."),
    }),
    execute: async (ctx, input): Promise<string> => {
      console.log(
        `🧮 Table row insert requested on node ${input.nodeId}, anchor ${input.anchorRowId ?? "<start>"}`,
      );

      try {
        const { nodeId } = input;
        const anchorRowId = input.anchorRowId?.trim() ?? "";
        const values = input.values;

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

        let insertIndex = 0;
        if (anchorRowId.length > 0) {
          const anchorMatches = rows.filter(
            (row) => (row.id ?? "").trim() === anchorRowId,
          );

          if (anchorMatches.length === 0) {
            return toolError(
              `No match found for anchorRowId "${input.anchorRowId}".`,
            );
          }
          if (anchorMatches.length > 1) {
            return toolError(
              `Found ${anchorMatches.length} matches for anchorRowId "${input.anchorRowId}". Please provide a unique rowId.`,
            );
          }

          const anchorIdx = rows.findIndex(
            (row) => (row.id ?? "").trim() === anchorRowId,
          );
          insertIndex = anchorIdx + 1;
        }

        const rowsToInsert: Array<TableRow> = [];

        for (const rowInput of values) {
          const resolvedUpdates: Array<{ columnId: string; value: unknown }> =
            [];

          for (const [columnInput, rawValue] of Object.entries(rowInput)) {
            const columnId = columnInput.trim();
            if (!columnId) {
              return toolError("columnId must be a non-empty string.");
            }

            const matchedColumns = columns.filter(
              (column) => column.id.trim() === columnId,
            );

            if (matchedColumns.length === 0) {
              return toolError(`No match found for columnId "${columnInput}".`);
            }
            if (matchedColumns.length > 1) {
              return toolError(
                `Found ${matchedColumns.length} matches for columnId "${columnInput}". Please provide a unique column id.`,
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

          const nextCells: Record<string, unknown> = {};
          for (const update of resolvedUpdates) {
            nextCells[update.columnId] = update.value;
          }

          rowsToInsert.push({
            id: generateLlmId(),
            cells: nextCells,
          });
        }

        const updatedRows = [
          ...rows.slice(0, insertIndex),
          ...rowsToInsert,
          ...rows.slice(insertIndex),
        ];

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
          `✅ Table row insert complete for node ${nodeId} (${rowsToInsert.length} row(s))`,
        );

        return `Successfully added ${rowsToInsert.length} rows.`;
      } catch (error) {
        console.error("Table insert rows tool error:", error);
        return toolError(
          error instanceof Error ? error.message : String(error),
        );
      }
    },
  });
}
