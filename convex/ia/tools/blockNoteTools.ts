// BlockNote editing tools for the agent layer.
//
// All five tools share one cohesive module: they are different operations over
// the same aggregate (the stored BlockNote document) and only differ in the
// `edit` payload they send to the atomic `editBlockNoteDocument` mutation. That
// mutation reads the current document, applies the operation, and writes it
// back inside a single Convex transaction (see `wrappers/nodeDataWrappers.ts`),
// so the tools themselves stay thin and race-free.
//
// Input contract: the model authors new content as plain markdown (explicitly
// lossy for the new content it is creating). Existing content is never round-
// tripped through markdown: `patch_block_text` operates on the native inline
// content, `update_block_props` merges props, and `replace_block`/`insert_blocks`
// only parse the model's *new* markdown into blocks. The annotated markdown
// returned by `read_nodes` is read-only and is rejected by every write path.

import { createTool } from "@convex-dev/agent";
import type { ToolSet } from "ai";
import { z } from "zod";
import { toolAgentNames, type ThreadCtx, type ToolAgentName } from "../agentConfig";
import { internal } from "../../_generated/api";
import { parseBlockNoteXml } from "../helpers/blockNoteMarkdown";
import { toolError, type ToolConfig } from "./toolHelpers";

// Mirrors the `AgentTool` shape used by `tools/index.ts` so the registry can
// consume this module's definitions without re-declaring them inline.
type AgentTool = ToolSet[string];

// All BlockNote tools are available to every agent that can act on a canvas.
const BLOCKNOTE_AGENTS = [
  toolAgentNames.nole,
  toolAgentNames.clone,
  toolAgentNames.supervisor,
  toolAgentNames.worker,
] as const;

const NODE_ID_FIELD = z
  .string()
  .describe("The blocknote node id in the current canvas.");

const EXPLANATION_FIELD = z
  .string()
  .describe("3-5 words explaining the edit intent.");

// ── insert_blocks ───────────────────────────────────────────────────────────

export const blocknoteInsertBlocksToolConfig: ToolConfig = {
  name: "insert_blocks",
  authorized_agents: [...BLOCKNOTE_AGENTS],
};

const insertBlocksSchema = z
  .object({
    nodeId: NODE_ID_FIELD,
    position: z
      .enum(["start", "end", "before", "after"])
      .describe(
        'Where to insert: "start"/"end" of the document, or "before"/"after" a reference block.',
      ),
    referenceBlockId: z
      .string()
      .optional()
      .describe(
        'Required when position is "before"/"after" (the id of the reference block). Ignored for "start"/"end".',
      ),
    blocks: z
      .string()
      .describe(
        "BlockNote XML v1 string (same format as read_nodes output) containing the block(s) to insert. The XML carries type, props, content and children; colors, alignment, underline and tables are preserved. New blocks always get fresh ids.",
      ),
    explanation: EXPLANATION_FIELD,
  })
  .refine(
    (input) =>
      input.position === "start" ||
      input.position === "end" ||
      !!input.referenceBlockId,
    {
      message:
        'referenceBlockId is required when position is "before" or "after".',
    },
  );

function blocknoteInsertBlocksTool({ threadCtx }: { threadCtx: ThreadCtx }) {
  const { canvasId } = threadCtx;
  return createTool({
    description:
      'Insert new block(s) into a blocknote node. The `blocks` parameter is a BlockNote XML v1 string (the same format you see in read_nodes output) — you can copy blocks from read_nodes and modify them. Use position "start"/"end" or "before"/"after" a reference block id. New blocks always get fresh ids.',
    inputSchema: insertBlocksSchema,
    execute: async (ctx, input): Promise<string> => {
      console.log(
        `🧱 insert_blocks on node ${input.nodeId} pos=${input.position}`,
      );
      try {
        const blocks = await parseBlockNoteXml(input.blocks);
        if (blocks.length === 0) {
          return toolError("The provided XML produced no blocks.");
        }

        const res = await ctx.runMutation(
          internal.wrappers.nodeDataWrappers.editBlockNoteDocument,
          {
            canvasId,
            nodeId: input.nodeId,
            threadId: ctx.threadId,
            edit: {
              kind: "insert",
              position: input.position,
              referenceBlockId: input.referenceBlockId,
              blocks,
            },
          },
        );

        const ids = res.insertedBlockIds ?? [];
        console.log(`✅ insert_blocks complete for node ${input.nodeId}`);
        return `Inserted ${ids.length} block(s) (ids: ${ids.join(", ")}).`;
      } catch (error) {
        console.error("insert_blocks tool error:", error);
        return toolError(error instanceof Error ? error.message : String(error));
      }
    },
  });
}

// ── replace_block ───────────────────────────────────────────────────────────

export const blocknoteReplaceBlockToolConfig: ToolConfig = {
  name: "replace_block",
  authorized_agents: [...BLOCKNOTE_AGENTS],
};

function blocknoteReplaceBlockTool({ threadCtx }: { threadCtx: ThreadCtx }) {
  const { canvasId } = threadCtx;
  return createTool({
    description:
      "Replace a single block (by id) with new content. The `block` parameter is a BlockNote XML v1 string (same format as read_nodes output) containing exactly one top-level block. The target block id is preserved; descendant ids that already belong to the replaced subtree are preserved, new descendants get fresh ids. For props-only edits prefer update_block_props; for surgical text edits prefer patch_block_text.",
    inputSchema: z.object({
      nodeId: NODE_ID_FIELD,
      blockId: z
        .string()
        .describe("The id of the block to replace (as seen in read_nodes output)."),
      block: z
        .string()
        .describe(
          "BlockNote XML v1 string containing exactly one top-level block (the replacement). Same format as read_nodes output.",
        ),
      explanation: EXPLANATION_FIELD,
    }),
    execute: async (ctx, input): Promise<string> => {
      console.log(
        `🧱 replace_block on node ${input.nodeId} blockId=${input.blockId}`,
      );
      try {
        const blocks = await parseBlockNoteXml(input.block);
        if (blocks.length === 0) {
          return toolError("The provided XML produced no blocks.");
        }
        if (blocks.length > 1) {
          return toolError(
            `replace_block expects exactly one block but the XML contained ${blocks.length}. Use insert_blocks to add multiple blocks.`,
          );
        }

        await ctx.runMutation(
          internal.wrappers.nodeDataWrappers.editBlockNoteDocument,
          {
            canvasId,
            nodeId: input.nodeId,
            threadId: ctx.threadId,
            edit: {
              kind: "replace",
              blockId: input.blockId,
              block: blocks[0],
            },
          },
        );

        console.log(`✅ replace_block complete for node ${input.nodeId}`);
        return `Replaced block "${input.blockId}".`;
      } catch (error) {
        console.error("replace_block tool error:", error);
        return toolError(error instanceof Error ? error.message : String(error));
      }
    },
  });
}

// ── delete_blocks ───────────────────────────────────────────────────────────

export const blocknoteDeleteBlocksToolConfig: ToolConfig = {
  name: "delete_blocks",
  authorized_agents: [...BLOCKNOTE_AGENTS],
};

function blocknoteDeleteBlocksTool({ threadCtx }: { threadCtx: ThreadCtx }) {
  const { canvasId } = threadCtx;
  return createTool({
    description:
      "Delete one or more blocks (by id) from a blocknote node. Provide the block ids as seen in read_nodes output. Deleting a parent block deletes its subtree. If any id is missing, no deletion is performed.",
    inputSchema: z.object({
      nodeId: NODE_ID_FIELD,
      blockIds: z
        .array(z.string())
        .min(1)
        .describe("The ids of the blocks to delete."),
      explanation: EXPLANATION_FIELD,
    }),
    execute: async (ctx, input): Promise<string> => {
      console.log(
        `🧱 delete_blocks on node ${input.nodeId} ids=${input.blockIds.join(", ")}`,
      );
      try {
        const res = await ctx.runMutation(
          internal.wrappers.nodeDataWrappers.editBlockNoteDocument,
          {
            canvasId,
            nodeId: input.nodeId,
            threadId: ctx.threadId,
            edit: { kind: "delete", blockIds: input.blockIds },
          },
        );

        console.log(`✅ delete_blocks complete for node ${input.nodeId}`);
        return `Deleted ${res.deletedCount ?? input.blockIds.length} block(s): ${input.blockIds.join(", ")}.`;
      } catch (error) {
        console.error("delete_blocks tool error:", error);
        return toolError(error instanceof Error ? error.message : String(error));
      }
    },
  });
}

// ── update_block_props ──────────────────────────────────────────────────────

export const blocknoteUpdateBlockPropsToolConfig: ToolConfig = {
  name: "update_block_props",
  authorized_agents: [...BLOCKNOTE_AGENTS],
};

function blocknoteUpdateBlockPropsTool({ threadCtx }: { threadCtx: ThreadCtx }) {
  const { canvasId } = threadCtx;
  return createTool({
    description:
      "Patch the props of a single block (by id) without touching its content or children. Merges the provided props onto the existing ones (only provided keys overwrite). Use this to change a heading level, text color, background color, alignment, etc.",
    inputSchema: z.object({
      nodeId: NODE_ID_FIELD,
      blockId: z
        .string()
        .describe("The id of the block whose props to update."),
      propsPatch: z
        .record(z.string(), z.unknown())
        .describe(
          'Partial props to merge, e.g. {"level":2}, {"textColor":"blue"}, {"textAlignment":"center"}. Only provided keys overwrite; others are preserved.',
        ),
      explanation: EXPLANATION_FIELD,
    }),
    execute: async (ctx, input): Promise<string> => {
      console.log(
        `🧱 update_block_props on node ${input.nodeId} blockId=${input.blockId}`,
      );
      try {
        await ctx.runMutation(
          internal.wrappers.nodeDataWrappers.editBlockNoteDocument,
          {
            canvasId,
            nodeId: input.nodeId,
            threadId: ctx.threadId,
            edit: {
              kind: "updateProps",
              blockId: input.blockId,
              propsPatch: input.propsPatch,
            },
          },
        );

        console.log(`✅ update_block_props complete for node ${input.nodeId}`);
        return `Updated props of block "${input.blockId}". New props: ${JSON.stringify(input.propsPatch)} merged onto existing.`;
      } catch (error) {
        console.error("update_block_props tool error:", error);
        return toolError(error instanceof Error ? error.message : String(error));
      }
    },
  });
}

// ── patch_block_text ────────────────────────────────────────────────────────

export const blocknotePatchBlockTextToolConfig: ToolConfig = {
  name: "patch_block_text",
  authorized_agents: [...BLOCKNOTE_AGENTS],
};

function blocknotePatchBlockTextTool({ threadCtx }: { threadCtx: ThreadCtx }) {
  const { canvasId } = threadCtx;
  return createTool({
    description:
      "Surgically replace an exact literal substring inside a single block's visible text (by block id). The match is scoped to that one block only, so a substring that appears many times in the document is safe as long as it is unique within the chosen block. Operates on the native inline content: styles, links and props outside the match are preserved. The match must not cross a link boundary or a non-text inline node — use replace_block for those. Prefer replace_block for edits that change block type/structure.",
    inputSchema: z.object({
      nodeId: NODE_ID_FIELD,
      blockId: z
        .string()
        .describe("The id of the block whose text to patch."),
      old_string: z
        .string()
        .min(1)
        .describe(
          "Exact literal substring to replace within the block's visible text (not markdown). Include enough context to make it unique within that block.",
        ),
      new_string: z
        .string()
        .describe("The replacement substring (literal text, may be empty to delete)."),
      explanation: EXPLANATION_FIELD,
    }),
    execute: async (ctx, input): Promise<string> => {
      console.log(
        `🧱 patch_block_text on node ${input.nodeId} blockId=${input.blockId}`,
      );
      try {
        await ctx.runMutation(
          internal.wrappers.nodeDataWrappers.editBlockNoteDocument,
          {
            canvasId,
            nodeId: input.nodeId,
            threadId: ctx.threadId,
            edit: {
              kind: "patchText",
              blockId: input.blockId,
              oldString: input.old_string,
              newString: input.new_string,
            },
          },
        );

        console.log(`✅ patch_block_text complete for node ${input.nodeId}`);
        return `Patched text in block "${input.blockId}".`;
      } catch (error) {
        console.error("patch_block_text tool error:", error);
        return toolError(error instanceof Error ? error.message : String(error));
      }
    },
  });
}

// ── Registry entry ───────────────────────────────────────────────────────────
// A single ordered list consumed by `tools/index.ts`, so BlockNote tools are
// declared once instead of being scattered across five near-identical files.

type ToolFactoryContext = { agentName: ToolAgentName; threadCtx: ThreadCtx };

export const blockNoteToolDefinitions: Array<{
  config: ToolConfig;
  factory: (context: ToolFactoryContext) => AgentTool | null;
}> = [
  {
    config: blocknoteInsertBlocksToolConfig,
    factory: ({ threadCtx }) => blocknoteInsertBlocksTool({ threadCtx }),
  },
  {
    config: blocknoteReplaceBlockToolConfig,
    factory: ({ threadCtx }) => blocknoteReplaceBlockTool({ threadCtx }),
  },
  {
    config: blocknoteDeleteBlocksToolConfig,
    factory: ({ threadCtx }) => blocknoteDeleteBlocksTool({ threadCtx }),
  },
  {
    config: blocknoteUpdateBlockPropsToolConfig,
    factory: ({ threadCtx }) => blocknoteUpdateBlockPropsTool({ threadCtx }),
  },
  {
    config: blocknotePatchBlockTextToolConfig,
    factory: ({ threadCtx }) => blocknotePatchBlockTextTool({ threadCtx }),
  },
];
