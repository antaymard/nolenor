import { createTool } from "@convex-dev/agent";
import { z } from "zod";
import { toolAgentNames, type ThreadCtx } from "../agentConfig";
import { internal } from "../../_generated/api";
import {
  markdownToPlateJson,
  plateJsonToMarkdown,
} from "../helpers/plateMarkdownConverter";
import {
  parseStoredPlateDocument,
  stringifyPlateDocumentForStorage,
} from "../../lib/plateDocumentStorage";
import { toolError, countExactMatches, type ToolConfig } from "./toolHelpers";

// Tool compaction config
export const documentStringReplaceContentToolConfig: ToolConfig = {
  name: "string_replace_document_content",
  authorized_agents: [
    toolAgentNames.nole,
    toolAgentNames.clone,
    toolAgentNames.supervisor,
    toolAgentNames.worker,
  ],
};

const ERROR_TARGET_NOT_DOCUMENT = toolError("Target node must be a document.");
const ERROR_INVALID_PLATE_DOC = toolError(
  "Document content is not valid PlateJSON.",
);

export default function documentStringReplaceContentTool({
  threadCtx,
}: {
  threadCtx: ThreadCtx;
}) {
  const { canvasId } = threadCtx;

  return createTool({
    description:
      "Replace an exact string inside a document node content from the current canvas.",
    inputSchema: z.object({
      nodeId: z.string().describe("The node ID in the current canvas."),
      old_string: z
        .string()
        .min(1)
        .describe(
          "Exact string to replace. Provide just enough context to make it unique in the document. Include the exact original markdown formatting and whitespace. ",
        ),
      new_string: z
        .string()
        .describe(
          "The replacement string to paste in place of old_string. Can be empty if you just want to delete the old_string. Use markdown formatting.",
        ),
      explanation: z.string().describe("3-5 words explaining the edit intent."),
    }),
    execute: async (ctx, input): Promise<string> => {
      console.log(
        `📝 String replace requested on node ${input.nodeId} - old_string: "${input.old_string}", new_string: "${input.new_string}"`,
      );

      try {
        const { nodeId, old_string, new_string } = input;

        const { node, nodeData } = await ctx.runQuery(
          internal.wrappers.canvasNodeWrappers.getNodeWithNodeData,
          {
            canvasId,
            nodeId,
          },
        );

        if (node.type !== "document" || nodeData.type !== "document") {
          return ERROR_TARGET_NOT_DOCUMENT;
        }

        const storedDoc = nodeData.values.doc;
        const parsedDoc = parseStoredPlateDocument(storedDoc);
        if (!parsedDoc) {
          return ERROR_INVALID_PLATE_DOC;
        }

        const markdownSource = await plateJsonToMarkdown(parsedDoc);

        const matches = countExactMatches(markdownSource, old_string);
        console.log(
          `🔎 Replacement search found ${matches} match(es) for node ${nodeId}`,
        );

        if (matches === 0) {
          return toolError(
            "No match found for replacement. Please check your text and try again.",
          );
        }

        if (matches > 1) {
          return toolError(
            `Found ${matches} matches for replacement text. Please provide more context to make a unique match.`,
          );
        }

        const updatedMarkdown = markdownSource.replace(old_string, new_string);

        const updatedPlateDocument = await markdownToPlateJson(updatedMarkdown);
        const serializedUpdatedDocument =
          stringifyPlateDocumentForStorage(updatedPlateDocument);

        await ctx.runMutation(internal.wrappers.nodeDataWrappers.updateValues, {
          _id: nodeData._id,
          values: {
            ...nodeData.values,
            doc: serializedUpdatedDocument,
          },
          actor: {
            type: "agent",
            userId: threadCtx.authUserId,
            threadId: ctx.threadId,
          },
        });

        console.log(`✅ String replace complete for node ${nodeId}`);

        return "Successfully replaced text at exactly one location.";
      } catch (error) {
        console.error("String replace tool error:", error);
        return toolError(
          error instanceof Error ? error.message : String(error),
        );
      }
    },
  });
}
