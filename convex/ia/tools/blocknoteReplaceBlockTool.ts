import { createTool } from "@convex-dev/agent";
import { z } from "zod";
import { toolAgentNames, type ThreadCtx } from "../agentConfig";
import { internal } from "../../_generated/api";
import {
  documentToAnnotatedMarkdown,
  resolveBlockInput,
} from "../helpers/blockNoteMarkdownConverter";
import {
  replaceBlock,
  type AnyBlock,
} from "../helpers/blocknoteBlockTree";
import {
  parseStoredPlateDocument,
  stringifyBlockNoteDocumentForStorage,
} from "../../lib/blockNoteDocumentStorage";
import { toolError, type ToolConfig } from "./toolHelpers";
import {
  ERROR_INVALID_DOC,
  ERROR_TARGET_NOT_BLOCKNOTE,
  REPLACE_BLOCK_DESCRIPTION,
} from "./blocknoteSchemas";

export const blocknoteReplaceBlockToolConfig: ToolConfig = {
  name: "replace_block",
  authorized_agents: [
    toolAgentNames.nole,
    toolAgentNames.clone,
    toolAgentNames.supervisor,
    toolAgentNames.worker,
  ],
};

export default function blocknoteReplaceBlockTool({
  threadCtx,
}: {
  threadCtx: ThreadCtx;
}) {
  const { canvasId } = threadCtx;

  return createTool({
    description: REPLACE_BLOCK_DESCRIPTION,
    inputSchema: z.object({
      nodeId: z.string().describe("The blocknote node id in the current canvas."),
      blockId: z
        .string()
        .describe("The id of the block to replace (as seen in read_nodes output)."),
      block: z
        .string()
        .describe(
          'Annotated markdown string — the same format as read_nodes output. Example: <block type="heading" props=\'{"level":3}\'>My heading</block>. Copy from read_nodes, modify the text, and send it back. Or plain markdown for simple text blocks (lossy).',
        ),
      explanation: z.string().describe("3-5 words explaining the edit intent."),
    }),
    execute: async (ctx, input): Promise<string> => {
      console.log(
        `🧱 replace_block on node ${input.nodeId} blockId=${input.blockId}`,
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

        const newBlock = await resolveBlockInput(input.block);

        const updated = replaceBlock(blocks, input.blockId, newBlock);
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

        const echo = await documentToAnnotatedMarkdown([newBlock]);
        console.log(`✅ replace_block complete for node ${input.nodeId}`);
        return `Replaced block "${input.blockId}" with:\n${echo}`;
      } catch (error) {
        console.error("replace_block tool error:", error);
        return toolError(error instanceof Error ? error.message : String(error));
      }
    },
  });
}
