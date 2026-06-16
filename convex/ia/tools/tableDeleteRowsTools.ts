import { createTool } from "@convex-dev/agent";
import { z } from "zod";
import { toolAgentNames, type ThreadCtx } from "../agentConfig";
import { internal } from "../../_generated/api";
import { ToolConfig, toolError } from "./toolHelpers";

// Tool compaction config
export const tableDeleteRowsToolConfig: ToolConfig = {
  name: "table_delete_rows",
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
  columns?: Array<unknown>;
  rows?: Array<TableRow>;
};

const ERROR_TARGET_NOT_TABLE = toolError("Target node must be a table.");
const ERROR_INVALID_TABLE_CONTENT = toolError(
  "Table content is not valid (expected table.columns and table.rows arrays).",
);
const ERROR_TABLE_SCHEMA_EMPTY = toolError(
  "Table schema is empty. Use table_update_schema first (operation: set or add_column) before deleting rows.",
);

function normalizeRowId(value: string): string {
  return value.trim();
}

export default function tableDeleteRowsTool({
  threadCtx,
}: {
  threadCtx: ThreadCtx;
}) {
  const { canvasId } = threadCtx;

  return createTool({
    description:
      "Delete one or multiple rows from a table node in the current canvas.",
    inputSchema: z.object({
      nodeId: z.string().describe("The node ID in the current canvas."),
      rowIds: z
        .array(z.string().min(1))
        .min(1)
        .describe(
          'List of table row IDs to delete (from _rowId in read_nodes). Example: `["row_001","row_003"]`.',
        ),
      explanation: z.string().describe("3-5 words explaining the edit intent."),
    }),
    execute: async (ctx, input): Promise<string> => {
      console.log(
        `🧮 Table row delete requested on node ${input.nodeId} for ${input.rowIds.length} row id(s)`,
      );

      try {
        const { nodeId, rowIds } = input;
        const normalizedRowIds = rowIds.map(normalizeRowId);

        const duplicateInput = normalizedRowIds.find(
          (id, index) => normalizedRowIds.indexOf(id) !== index,
        );
        if (duplicateInput) {
          return toolError(
            `rowId "${duplicateInput}" is provided multiple times.`,
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

        for (const rawRowId of rowIds) {
          const wantedId = normalizeRowId(rawRowId);
          const matches = rows.filter(
            (row) => normalizeRowId(row.id ?? "") === wantedId,
          );

          if (matches.length === 0) {
            return toolError(`No match found for rowId "${rawRowId}".`);
          }
          if (matches.length > 1) {
            return toolError(
              `Found ${matches.length} matches for rowId "${rawRowId}". Please provide a unique rowId.`,
            );
          }
        }

        const idsToDelete = new Set(normalizedRowIds);
        const updatedRows = rows.filter(
          (row) => !idsToDelete.has(normalizeRowId(row.id ?? "")),
        );

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
          `✅ Table row delete complete for node ${nodeId} (${normalizedRowIds.length} row(s))`,
        );

        return `Successfully deleted ${normalizedRowIds.length} row.`;
      } catch (error) {
        console.error("Table delete rows tool error:", error);
        return toolError(
          error instanceof Error ? error.message : String(error),
        );
      }
    },
  });
}
