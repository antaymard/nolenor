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
import { toolError, ToolConfig } from "./toolHelpers";

// Tool compaction config
export const documentInsertContentToolConfig: ToolConfig = {
  name: "insert_document_content",
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

function countExactMatches(source: string, search: string): number {
  if (!search) return 0;

  let count = 0;
  let index = 0;

  while (true) {
    const foundAt = source.indexOf(search, index);
    if (foundAt === -1) break;
    count += 1;
    index = foundAt + search.length;
  }

  return count;
}

export default function documentInsertContentTool({
  threadCtx,
}: {
  threadCtx: ThreadCtx;
}) {
  const { canvasId } = threadCtx;

  return createTool({
    description:
      "Insert new content into a document node from the current canvas.",
    inputSchema: z.object({
      nodeId: z.string().describe("The node ID in the current canvas."),
      anchor_text: z
        .string()
        .optional()
        .describe(
          "Exact anchor text. Provide just enough context to make it unique in the document. Include the exact original markdown formatting and whitespace. Empty for start/end insertions.",
        ),
      position: z
        .enum(["before", "after", "end", "start"])
        .describe(
          "Insertion position: before/after anchor_text, or start/end of whole document.",
        ),
      content: z
        .string()
        .describe("The content to insert. Use markdown formatting."),
      explanation: z.string().describe("3-5 words explaining the edit intent."),
    }),
    execute: async (ctx, input): Promise<string> => {
      console.log(
        `📝 Insert requested on node ${input.nodeId} (canvas ${canvasId}) at position ${input.position}`,
      );

      try {
        const { nodeId, anchor_text, position, content } = input;

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

        let updatedMarkdown: string;

        if (position === "start") {
          updatedMarkdown = markdownSource
            ? `${content}\n${markdownSource}`
            : content;
        } else if (position === "end") {
          updatedMarkdown = markdownSource
            ? `${markdownSource}\n${content}`
            : content;
        } else {
          if (!anchor_text) {
            return toolError(
              "No match found insertion. Please check your text and try again.",
            );
          }

          const matches = countExactMatches(markdownSource, anchor_text);
          console.log(
            `🔎 Insertion anchor search found ${matches} match(es) for node ${nodeId}`,
          );

          if (matches === 0) {
            return toolError(
              "No match found insertion. Please check your text and try again.",
            );
          }

          if (matches > 1) {
            return toolError(
              `Found ${matches} matches. Please provide more context to make a unique match.`,
            );
          }

          if (position === "after") {
            updatedMarkdown = markdownSource.replace(
              anchor_text,
              `${anchor_text}\n${content}`,
            );
          } else {
            updatedMarkdown = markdownSource.replace(
              anchor_text,
              `${content}\n${anchor_text}`,
            );
          }
        }

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

        console.log(`✅ Insert complete for node ${nodeId}`);

        return "Successfully inserted text at exactly one location.";
      } catch (error) {
        console.error("Insert document tool error:", error);
        return toolError(
          error instanceof Error ? error.message : String(error),
        );
      }
    },
  });
}
