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

export const blocknoteReplaceBlockToolConfig: ToolConfig = {
  name: "replace_block",
  authorized_agents: [
    toolAgentNames.nole,
    toolAgentNames.clone,
    toolAgentNames.supervisor,
    toolAgentNames.worker,
  ],
};

const ERROR_TARGET_NOT_BLOCKNOTE = toolError(
  "Target node must be a blocknote node.",
);
const ERROR_INVALID_DOC = toolError("Blocknote document content is not valid.");

export default function blocknoteReplaceBlockTool({
  threadCtx,
}: {
  threadCtx: ThreadCtx;
}) {
  const { canvasId } = threadCtx;

  return createTool({
    description:
      "Replace a single block (by id) inside a blocknote node. Accepts either a JSON block object (lossless — preserves colors, alignment, props, table content) or a markdown string (converted to a block; lossy for rich inline styles). The replacement gets a fresh id.",
    inputSchema: z.object({
      nodeId: z.string().describe("The blocknote node id in the current canvas."),
      blockId: z
        .string()
        .describe("The id of the block to replace (as seen in read_nodes output)."),
      block: z
        .union([z.string(), z.record(z.string(), z.unknown())])
        .describe(
          "The new block. Either a markdown string (e.g. \"## Heading\\nText with **bold**\") or a JSON block object ({ type, props, content, children }). JSON is lossless and preferred for colored/aligned/table blocks.",
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
