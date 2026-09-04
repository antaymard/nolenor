import { createTool } from "@convex-dev/agent";
import { internal } from "../../_generated/api";
import type { Doc } from "../../_generated/dataModel";
import { toolAgentNames, type ThreadCtx } from "../agentConfig";
import { nodeTypeValues } from "../../schemas/nodeTypeSchema";
import { validateNodeInputSchemaForLLM } from "../helpers/nodeInputSchemaValidatorForLLM";
import {
  findUnresolvedMentionTokens,
  markdownToBlockNoteBlocks,
} from "../helpers/blockNoteMarkdown";
import {
  resolveNodeMentionTokens,
  unresolvedMentionTokensError,
} from "../helpers/resolveNodeMentionTokens";
import { decodeLLMValuesForTemplate } from "../helpers/customFieldLLMCodecs";
import z from "zod";
import { EXPLANATION_FIELD, type ToolConfig, toolError } from "./toolHelpers";

// Tool compaction config
export const setNodeDataToolConfig: ToolConfig = {
  name: "set_node_data",
  authorized_agents: [
    toolAgentNames.nole,
    toolAgentNames.worker,
  ],
  mcp: { access: "write" },
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
      'Set values on the nodeData of a given nodeId. `data` may be either a JSON object or a JSON-encoded string (it will be parsed). For blocknote nodes, pass `{ doc: "<markdown>" }` to replace the ENTIRE document with the given markdown — this is an intentionally lossy operation: block ids are regenerated and block-level props (colors, alignment, etc.) are reset to defaults, so you MUST re-read the node (read_nodes) before any block-id-addressed edit (insert_blocks, replace_block, delete_blocks, update_block_props, patch_block_text). For precise/preserving edits prefer those block-level tools instead. That Markdown supports the same pill tokens as the block-level tools: `[[date:YYYY-MM-DD]]`, and `[[node:<nodeId>]]` to mention another node of this canvas. For app nodes, partial updates are supported: pass `{ state }` alone to update only the persisted app state and keep the existing `code` untouched, or pass `{ code }` alone to update only the source code. When a key is provided it overwrites the existing value (no deep merge of `state`). For custom (user-templated) nodes, `data` keys are the FIELD IDS of the node\'s template (not field names — see the <nodeDataSchemas> entry from read_nodes/list_nodes); provided field ids overwrite their value, other fields are kept. Table nodes are not supported here — use table_insert_rows, table_update_rows, table_delete_rows, or table_update_schema.',
    inputSchema: z.object({
      explanation: EXPLANATION_FIELD,
      nodeType: z
        .enum(nodeTypeValues)
        .describe("Type of the target node (must match the provided nodeId)."),
      nodeId: z.string().describe("Canvas ID of the node to update."),
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

        // Custom nodes : le schéma d'écriture est généré depuis le template
        // de l'instance (values keyées par fieldId). Sémantique merge : les
        // fieldIds fournis écrasent, les autres sont conservés (updateValues
        // merge déjà côté serveur — on valide seulement le delta).
        let template: Doc<"nodeTemplates"> | null = null;
        if (input.nodeType === "custom") {
          const templateId = nodeLookup.nodeData.templateId;
          if (templateId) {
            template = await ctx.runQuery(
              internal.wrappers.nodeTemplateWrappers.getTemplate,
              { templateId },
            );
          }
        }

        const validationError = validateNodeInputSchemaForLLM({
          nodeType: input.nodeType,
          input: valuesToWrite,
          template,
        });
        if (validationError) {
          return toolError(validationError);
        }

        // Blocknote: full replacement uses plain Markdown (intentionally
        // lossy). The block tree is parsed, normalized (fresh ids), validated
        // and stored by the atomic editBlockNoteDocument mutation. For
        // precise/preserving edits the agent should use the block-level tools
        // (insert_blocks, replace_block, etc.) which accept BlockNote XML v1.
        if (input.nodeType === "blocknote") {
          const doc = valuesToWrite.doc;
          if (typeof doc !== "string") {
            return toolError("blocknote `doc` must be a Markdown string.");
          }
          // Both the wrapped and the bare form are valid input for the XML
          // tools, so both must be caught here — otherwise the XML would go
          // through the Markdown parser and land as literal text in the doc.
          const trimmed = doc.trim();
          if (
            trimmed.startsWith("<blocknote") ||
            trimmed.startsWith("<block")
          ) {
            return toolError(
              "blocknote `doc` for set_node_data must be plain Markdown, not BlockNote XML. Use insert_blocks / replace_block for XML edits, or provide Markdown here for a full (lossy) replace.",
            );
          }
          // `[[node:…]]` tokens are resolved against the canvas so they land
          // as real mention pills; any that reached the document as text named
          // a node that does not exist here, and the edit is refused rather
          // than persisting the token as debris.
          const mentions = await resolveNodeMentionTokens(ctx, canvasId, doc);
          const blocks = await markdownToBlockNoteBlocks(doc, { mentions });
          const unresolved = findUnresolvedMentionTokens(blocks);
          if (unresolved.length > 0) {
            return toolError(unresolvedMentionTokensError(unresolved));
          }
          await ctx.runMutation(
            internal.wrappers.nodeDataWrappers.editBlockNoteDocument,
            {
              nodeDataId: nodeLookup.nodeData._id,
              edit: { kind: "replaceDocument", blocks },
              actor: {
                type: "agent",
                userId: threadCtx.authUserId,
                threadId: ctx.threadId,
              },
            },
          );
          return `Node data updated for nodeId ${input.nodeId}. Block ids have been regenerated — re-read the node (read_nodes) before any block-id-addressed edit.`;
        }

        // Custom : traduction forme-LLM → forme stockée, par type de champ
        // (rich_text : markdown → blocs BlockNote). Symétrique de ce que
        // makeCustomNodeDataLLMFriendly fait en lecture — les deux sens vivent
        // dans customFieldLLMCodecs.
        if (input.nodeType === "custom" && template) {
          await decodeLLMValuesForTemplate(valuesToWrite, template.fields);
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
