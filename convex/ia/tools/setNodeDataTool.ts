import { createTool } from "@convex-dev/agent";
import { internal } from "../../_generated/api";
import { toolAgentNames, type ThreadCtx } from "../agentConfig";
import { nodeTypeValues } from "../../schemas/nodeTypeSchema";
import { validateNodeInputSchemaForLLM } from "../helpers/nodeInputSchemaValidatorForLLM";
import { markdownToPlateJson } from "../helpers/plateMarkdownConverter";
import { stringifyPlateDocumentForStorage } from "../../lib/plateDocumentStorage";
import z from "zod";
import { type ToolConfig, toolError } from "./toolHelpers";

// Tool compaction config
export const setNodeDataToolConfig: ToolConfig = {
  name: "set_node_data",
  authorized_agents: [
    toolAgentNames.nole,
    toolAgentNames.clone,
    toolAgentNames.supervisor,
    toolAgentNames.worker,
  ],
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export default function setNodeDataTool({
  threadCtx,
}: {
  threadCtx: ThreadCtx;
}) {
  const { canvasId } = threadCtx;

  return createTool({
    description:
      'Set values on the nodeData of a given nodeId. `data` may be either a JSON object or a JSON-encoded string (it will be parsed). For document nodes, pass `{ doc: "<markdown>" }` to replace the ENTIRE document content with the given markdown (it is converted to the internal format before saving); for targeted edits prefer string_replace_document_content or insert_document_content. For app nodes, partial updates are supported: pass `{ state }` alone to update only the persisted app state and keep the existing `code` untouched, or pass `{ code }` alone to update only the source code. When a key is provided it overwrites the existing value (no deep merge of `state`). Table nodes are not supported here — use table_insert_rows, table_update_rows, table_delete_rows, or table_update_schema.',
    inputSchema: z.object({
      explanation: z
        .string()
        .describe("3-5 words explaining the research intent."),
      nodeType: z
        .enum(nodeTypeValues)
        .describe("Type du node cible (doit correspondre au nodeId fourni)."),
      nodeId: z.string().describe("ID canvas du node à mettre à jour."),
      data: z
        .union([z.record(z.string(), z.unknown()), z.string()])
        .describe(
          "Object (or JSON-encoded string) of values to write into the nodeData. For app nodes, missing top-level keys (`code` / `state`) are kept from the current values; provided keys overwrite the existing value (no deep merge).",
        ),
    }),
    execute: async (ctx, input): Promise<string> => {
      try {
        if (input.nodeType === "table") {
          return toolError(
            "Cannot set table data: use table_insert_rows, table_update_rows, table_delete_rows, or table_update_schema.",
          );
        }

        let parsedData: Record<string, unknown>;
        if (typeof input.data === "string") {
          let jsonParsed: unknown;
          try {
            jsonParsed = JSON.parse(input.data);
          } catch (parseError) {
            return toolError(
              `\`data\` was provided as a string but is not valid JSON: ${
                parseError instanceof Error
                  ? parseError.message
                  : String(parseError)
              }. Pass either a JSON object or a JSON-encoded string.`,
            );
          }
          if (!isPlainObject(jsonParsed)) {
            return toolError(
              "`data` parsed from string must be a JSON object (got array or primitive).",
            );
          }
          parsedData = jsonParsed;
        } else {
          parsedData = input.data;
        }

        const nodeLookup = await ctx.runQuery(
          internal.wrappers.canvasNodeWrappers.getNodeWithNodeData,
          {
            canvasId,
            nodeId: input.nodeId,
          },
        );

        if (nodeLookup.node.type !== input.nodeType) {
          return toolError(
            `Node type mismatch for nodeId ${input.nodeId}: expected ${input.nodeType}, got ${nodeLookup.node.type}.`,
          );
        }

        // For app nodes, merge with existing values at the top level so the
        // caller can update `state` without resending `code` (and vice-versa).
        // Provided keys overwrite the existing value entirely (no deep merge).
        let valuesToWrite: Record<string, unknown> = parsedData;
        if (input.nodeType === "app") {
          const existingValues =
            nodeLookup.nodeData.type === "app"
              ? (nodeLookup.nodeData.values as Record<string, unknown>)
              : {};
          valuesToWrite = { ...existingValues, ...parsedData };
        }

        const validationError = validateNodeInputSchemaForLLM({
          nodeType: input.nodeType,
          input: valuesToWrite,
        });
        if (validationError) {
          return toolError(validationError);
        }

        // Documents receive markdown in `doc` from the LLM; convert it to the
        // PlateJS structure and serialize it before saving (same cycle used by
        // insert_document_content / string_replace_document_content).
        if (input.nodeType === "document") {
          const markdown =
            typeof valuesToWrite.doc === "string" ? valuesToWrite.doc : "";
          valuesToWrite = {
            ...valuesToWrite,
            doc: stringifyPlateDocumentForStorage(
              await markdownToPlateJson(markdown),
            ),
          };
        }

        await ctx.runMutation(internal.wrappers.nodeDataWrappers.updateValues, {
          _id: nodeLookup.nodeData._id,
          values: valuesToWrite,
          actor: {
            type: "agent",
            userId: threadCtx.authUserId,
            threadId: ctx.threadId,
          },
        });

        return `Node data updated for nodeId ${input.nodeId}.`;
      } catch (error) {
        return toolError(
          `Error while setting node data for nodeId ${input.nodeId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  });
}
