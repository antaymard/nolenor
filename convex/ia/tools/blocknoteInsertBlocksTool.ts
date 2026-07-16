import { createTool } from "@convex-dev/agent";
import { z } from "zod";
import { toolAgentNames, type ThreadCtx } from "../agentConfig";
import { internal } from "../../_generated/api";
import {
  documentToAnnotatedMarkdown,
  resolveBlocksInput,
} from "../helpers/blockNoteMarkdownConverter";
import {
  insertBlocks,
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
  INSERT_BLOCKS_DESCRIPTION,
} from "./blocknoteSchemas";

export const blocknoteInsertBlocksToolConfig: ToolConfig = {
  name: "insert_blocks",
  authorized_agents: [
    toolAgentNames.nole,
    toolAgentNames.clone,
    toolAgentNames.supervisor,
    toolAgentNames.worker,
  ],
};

export default function blocknoteInsertBlocksTool({
  threadCtx,
}: {
  threadCtx: ThreadCtx;
}) {
  const { canvasId } = threadCtx;

  return createTool({
    description: INSERT_BLOCKS_DESCRIPTION,
    inputSchema: z.object({
      nodeId: z.string().describe("The blocknote node id in the current canvas."),
      reference: z
        .union([z.string(), z.literal("START"), z.literal("END")])
        .describe(
          "Reference block id, or \"START\" to insert at the beginning, or \"END\" to insert at the end.",
        ),
      position: z
        .enum(["before", "after"])
        .describe(
          "Insert before or after the reference block. Ignored (treated as append/prepend) when reference is START/END.",
        ),
      blocks: z
        .string()
        .describe(
          'Annotated markdown string — the same format as read_nodes output. Multiple blocks separated by blank lines. Example: <block type="heading" props=\'{"level":2}\'>Section</block>\n\n<block type="paragraph">Body text</block>. Or plain markdown for simple text blocks (lossy).',
        ),
      explanation: z.string().describe("3-5 words explaining the edit intent."),
    }),
    execute: async (ctx, input): Promise<string> => {
      console.log(
        `🧱 insert_blocks on node ${input.nodeId} ref=${input.reference} pos=${input.position}`,
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

        const newBlocks = await resolveBlocksInput(input.blocks);

        const updated = insertBlocks(
          blocks,
          input.reference,
          input.position,
          newBlocks,
        );
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

        const echo = await documentToAnnotatedMarkdown(newBlocks);
        const newIds = newBlocks.map((b: AnyBlock) => b.id).join(", ");
        console.log(`✅ insert_blocks complete for node ${input.nodeId}`);
        return `Inserted ${newBlocks.length} block(s) (ids: ${newIds}):\n${echo}`;
      } catch (error) {
        console.error("insert_blocks tool error:", error);
        return toolError(error instanceof Error ? error.message : String(error));
      }
    },
  });
}
