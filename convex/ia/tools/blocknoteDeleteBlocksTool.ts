import { createTool } from "@convex-dev/agent";
import { z } from "zod";
import { toolAgentNames, type ThreadCtx } from "../agentConfig";
import { internal } from "../../_generated/api";
import { deleteBlocks, type AnyBlock } from "../helpers/blocknoteBlockTree";
import {
  parseStoredPlateDocument,
  stringifyBlockNoteDocumentForStorage,
} from "../../lib/blockNoteDocumentStorage";
import { toolError, type ToolConfig } from "./toolHelpers";

export const blocknoteDeleteBlocksToolConfig: ToolConfig = {
  name: "delete_blocks",
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

export default function blocknoteDeleteBlocksTool({
  threadCtx,
}: {
  threadCtx: ThreadCtx;
}) {
  const { canvasId } = threadCtx;

  return createTool({
    description:
      "Delete one or more blocks (by id) from a blocknote node. Provide the block ids as seen in read_nodes output.",
    inputSchema: z.object({
      nodeId: z.string().describe("The blocknote node id in the current canvas."),
      blockIds: z
        .array(z.string())
        .min(1)
        .describe("The ids of the blocks to delete."),
      explanation: z.string().describe("3-5 words explaining the edit intent."),
    }),
    execute: async (ctx, input): Promise<string> => {
      console.log(
        `🧱 delete_blocks on node ${input.nodeId} ids=${input.blockIds.join(", ")}`,
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

        const { tree, missing } = deleteBlocks(blocks, input.blockIds);
        if (missing.length > 0) {
          return toolError(
            `Some block ids were not found: ${missing.join(", ")}. No deletion performed.`,
          );
        }

        const serialized = stringifyBlockNoteDocumentForStorage(tree);

        await ctx.runMutation(internal.wrappers.nodeDataWrappers.updateValues, {
          _id: nodeData._id,
          values: { ...nodeData.values, doc: serialized },
          actor: {
            type: "agent",
            userId: threadCtx.authUserId,
            threadId: ctx.threadId,
          },
        });

        console.log(`✅ delete_blocks complete for node ${input.nodeId}`);
        return `Deleted ${input.blockIds.length} block(s): ${input.blockIds.join(", ")}.`;
      } catch (error) {
        console.error("delete_blocks tool error:", error);
        return toolError(error instanceof Error ? error.message : String(error));
      }
    },
  });
}
