import { createTool } from "@convex-dev/agent";
import { z } from "zod";
import { toolAgentNames, type ThreadCtx } from "../agentConfig";
import { internal } from "../../_generated/api";
import {
  blocksToMarkdown,
  markdownToBlocks,
  documentToAnnotatedMarkdown,
} from "../helpers/blockNoteMarkdownConverter";
import {
  findBlock,
  updateBlockContent,
  type AnyBlock,
} from "../helpers/blocknoteBlockTree";
import {
  parseStoredPlateDocument,
  stringifyBlockNoteDocumentForStorage,
} from "../../lib/blockNoteDocumentStorage";
import { toolError, countExactMatches, type ToolConfig } from "./toolHelpers";
import { ERROR_INVALID_DOC, ERROR_TARGET_NOT_BLOCKNOTE } from "./blocknoteSchemas";

export const blocknotePatchBlockTextToolConfig: ToolConfig = {
  name: "patch_block_text",
  authorized_agents: [
    toolAgentNames.nole,
    toolAgentNames.clone,
    toolAgentNames.supervisor,
    toolAgentNames.worker,
  ],
};

export default function blocknotePatchBlockTextTool({
  threadCtx,
}: {
  threadCtx: ThreadCtx;
}) {
  const { canvasId } = threadCtx;

  return createTool({
    description:
      "Surgically replace an exact substring inside a single block's text (by block id). The match is scoped to that one block only, so a substring that appears many times in the document is safe as long as it is unique within the chosen block. Prefer replace_block for edits that change block type/structure.",
    inputSchema: z.object({
      nodeId: z.string().describe("The blocknote node id in the current canvas."),
      blockId: z
        .string()
        .describe("The id of the block whose text to patch."),
      old_string: z
        .string()
        .min(1)
        .describe(
          "Exact substring to replace within the block. Include enough context to make it unique within that block.",
        ),
      new_string: z
        .string()
        .describe("The replacement substring. Can be empty to delete text."),
      explanation: z.string().describe("3-5 words explaining the edit intent."),
    }),
    execute: async (ctx, input): Promise<string> => {
      console.log(
        `🧱 patch_block_text on node ${input.nodeId} blockId=${input.blockId}`,
      );
      try {
        const { node, nodeData } = await ctx.runQuery(
          internal.wrappers.canvasNodeWrappers.getNodeWithNodeData,
          { canvasId, nodeId: input.nodeId },
        );
        if (node.type !== "blocknote" || nodeData.type !== "blocknote") {
          return ERROR_TARGET_NOT_BLOCKNOTE;
        }

        const blocks = parseStoredPlateDocument(nodeData.values.doc) as
          | AnyBlock[]
          | null;
        if (!blocks) return ERROR_INVALID_DOC;

        const target = findBlock(blocks, input.blockId);
        if (!target) {
          return toolError(
            `Block id "${input.blockId}" was not found in this document.`,
          );
        }

        // Convert just the targeted block to markdown, do the replace there,
        // convert back to a block, and reuse the resulting content.
        const blockMd = (await blocksToMarkdown([{ ...target, children: [] }])).trim();

        const matches = countExactMatches(blockMd, input.old_string);
        if (matches === 0) {
          return toolError(
            `No match found for old_string within block "${input.blockId}". Block markdown:\n${blockMd}`,
          );
        }
        if (matches > 1) {
          return toolError(
            `Found ${matches} matches for old_string within block "${input.blockId}". Provide more context to make a unique match. Block markdown:\n${blockMd}`,
          );
        }

        const patchedMd = blockMd.replace(input.old_string, input.new_string);
        const reparsed = await markdownToBlocks(patchedMd);
        if (!reparsed || reparsed.length === 0) {
          return toolError(
            "Patched markdown produced no blocks. The replacement may have resulted in invalid content.",
          );
        }
        const newContent = reparsed[0].content;

        const updated = updateBlockContent(blocks, input.blockId, newContent);
        const serialized = stringifyBlockNoteDocumentForStorage(updated);

        await ctx.runMutation(internal.wrappers.nodeDataWrappers.updateValues, {
          _id: nodeData._id,
          values: { ...nodeData.values, doc: serialized },
          actor: {
            type: "agent",
            userId: threadCtx.authUserId,
            threadId: ctx.threadId,
          },
        });

        const patchedBlock = findBlock(updated, input.blockId);
        const echo = patchedBlock
          ? await documentToAnnotatedMarkdown([patchedBlock])
          : "";
        console.log(`✅ patch_block_text complete for node ${input.nodeId}`);
        return `Patched text in block "${input.blockId}".\n${echo}`;
      } catch (error) {
        console.error("patch_block_text tool error:", error);
        return toolError(error instanceof Error ? error.message : String(error));
      }
    },
  });
}
