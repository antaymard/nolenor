import { createTool } from "@convex-dev/agent";
import { z } from "zod";
import { toolAgentNames, type ThreadCtx } from "../agentConfig";
import { internal } from "../../_generated/api";
import {
  findBlock,
  updateBlockProps,
  type AnyBlock,
} from "../helpers/blocknoteBlockTree";
import {
  parseStoredPlateDocument,
  stringifyBlockNoteDocumentForStorage,
} from "../../lib/blockNoteDocumentStorage";
import { toolError, type ToolConfig } from "./toolHelpers";

export const blocknoteUpdateBlockPropsToolConfig: ToolConfig = {
  name: "update_block_props",
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

export default function blocknoteUpdateBlockPropsTool({
  threadCtx,
}: {
  threadCtx: ThreadCtx;
}) {
  const { canvasId } = threadCtx;

  return createTool({
    description:
      "Patch the props of a single block (by id) in a blocknote node without touching its content/children. Merges the provided props onto the existing ones. Use this to change a heading level, text color, background color, alignment, link url, image caption, etc.",
    inputSchema: z.object({
      nodeId: z.string().describe("The blocknote node id in the current canvas."),
      blockId: z
        .string()
        .describe("The id of the block whose props to update."),
      propsPatch: z
        .record(z.string(), z.unknown())
        .describe(
          "Partial props to merge, e.g. {\"level\":2}, {\"textColor\":\"blue\"}, {\"textAlignment\":\"center\"}. Only provided keys overwrite; others are preserved.",
        ),
      explanation: z.string().describe("3-5 words explaining the edit intent."),
    }),
    execute: async (ctx, input): Promise<string> => {
      console.log(
        `🧱 update_block_props on node ${input.nodeId} blockId=${input.blockId}`,
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

        const existing = findBlock(blocks, input.blockId);
        if (!existing) {
          return toolError(
            `Block id "${input.blockId}" was not found in this document.`,
          );
        }

        const updated = updateBlockProps(blocks, input.blockId, input.propsPatch);
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

        const newProps = { ...(existing.props ?? {}), ...input.propsPatch };
        console.log(`✅ update_block_props complete for node ${input.nodeId}`);
        return `Updated props of block "${input.blockId}". New props: ${JSON.stringify(newProps)}`;
      } catch (error) {
        console.error("update_block_props tool error:", error);
        return toolError(error instanceof Error ? error.message : String(error));
      }
    },
  });
}
