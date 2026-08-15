// BlockNote editing tools for the agent layer.
//
// All five tools share one cohesive module: they are different operations over
// the same aggregate (the stored BlockNote document) and only differ in the
// `edit` payload they send to the atomic `editBlockNoteDocument` mutation. That
// mutation reads the current document, applies the operation, and writes it
// back inside a single Convex transaction (see `wrappers/nodeDataWrappers.ts`),
// so the tools themselves stay thin and race-free.
//
// Auth follows the same pattern as the document tools: the tool does a node
// lookup via `getNodeWithNodeData` (no auth in the query), validates the type,
// then calls the mutation with `nodeDataId` + `actor`. Access was already
// enforced at the `saveMessage` entrypoint (editor-level requireCanvasAccess).

import { createTool, type ToolCtx } from "@convex-dev/agent";
import type { ToolSet } from "ai";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { z } from "zod";
import { toolAgentNames, type ThreadCtx, type ToolAgentName } from "../agentConfig";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { parseBlockNoteXml } from "../helpers/blockNoteMarkdown";
import { EXPLANATION_FIELD, toolError, type ToolConfig } from "./toolHelpers";

type AgentTool = ToolSet[string];

const BLOCKNOTE_AGENTS = [
  toolAgentNames.nole,
  toolAgentNames.clone,
  toolAgentNames.supervisor,
  toolAgentNames.worker,
] as const;

const NODE_ID_FIELD = z
  .string()
  .describe("The blocknote node id in the current canvas.");

const BLOCK_ID_FIELD = (what: string) =>
  z.string().describe(`The id of the block ${what} (as seen in read_nodes output).`);

/**
 * The `blocks` / `block` argument description, shared by insert_blocks and
 * replace_block. It spells the wire format out rather than naming it: this
 * string and the `<schema type="blocknote">` card from read_nodes are the
 * model's only documentation of a format it hand-writes on every edit, and the
 * failures seen in production were format failures — blocks left unclosed, and
 * a table nobody knew how to spell. Each tool states its own id rule, which
 * differs between insert and replace.
 */
const XML_PAYLOAD_HINT = (shape: string) =>
  `BlockNote XML v1: ${shape}, each closed by </block>. The <blocknote> wrapper from read_nodes output is accepted but not required; omit empty <children/>. A block's text is plain Markdown — write & and < literally, no XML escaping needed. One <block> per block (a blank line inside one is an error); nest with <children>. Props carry type-specific settings, colors and alignment. Example: <block type="heading" props='{"level":2}'>Some **markdown**</block>. For a table, write a Markdown pipe table as the block text: <block type="table">| Nom | Rôle |\n| --- | --- |\n| Alice | Dev |</block>`;

// ── Shared execution path ───────────────────────────────────────────────────
//
// The five tools only differ in their input schema and in the `edit` payload
// they build, so node lookup, actor attribution, logging and error shaping all
// live here. `buildEdit` runs after the lookup so that expensive work (XML
// parsing, which spins up jsdom) is never paid for an invalid nodeId.

// Derived from the mutation reference so the tools stay in sync with
// `blockNoteEditValidator` (wrappers/nodeDataWrappers.ts) automatically.
type EditMutation = typeof internal.wrappers.nodeDataWrappers.editBlockNoteDocument;
type BlockNoteEditPayload = FunctionArgs<EditMutation>["edit"];
type EditResult = FunctionReturnType<EditMutation>;

/** Resolve a canvas nodeId to its nodeData _id, validating that it is a blocknote. */
async function lookupBlocknoteNodeData(
  ctx: ToolCtx,
  canvasId: Id<"canvases">,
  nodeId: string,
): Promise<{ nodeDataId: Id<"nodeDatas"> } | { error: string }> {
  const { node, nodeData } = await ctx.runQuery(
    internal.wrappers.canvasNodeWrappers.getNodeWithNodeData,
    { canvasId, nodeId },
  );
  if (node.type !== "blocknote" || nodeData.type !== "blocknote") {
    return { error: "Target node must be a blocknote." };
  }
  return { nodeDataId: nodeData._id };
}

async function runBlockNoteEdit({
  ctx,
  threadCtx,
  toolName,
  nodeId,
  logSuffix,
  buildEdit,
  describeResult,
}: {
  ctx: ToolCtx;
  threadCtx: ThreadCtx;
  toolName: string;
  nodeId: string;
  /** Extra context appended to the entry log line, e.g. `blockId=abc`. */
  logSuffix: string;
  /** Builds the mutation payload. Runs after the lookup; may throw or reject. */
  buildEdit: () => Promise<BlockNoteEditPayload> | BlockNoteEditPayload;
  describeResult: (result: EditResult) => string;
}): Promise<string> {
  console.log(`🧱 ${toolName} on node ${nodeId} ${logSuffix}`);
  try {
    const lookup = await lookupBlocknoteNodeData(ctx, threadCtx.canvasId, nodeId);
    if ("error" in lookup) return toolError(lookup.error);

    const result = await ctx.runMutation(
      internal.wrappers.nodeDataWrappers.editBlockNoteDocument,
      {
        nodeDataId: lookup.nodeDataId,
        edit: await buildEdit(),
        actor: {
          type: "agent",
          userId: threadCtx.authUserId,
          threadId: ctx.threadId,
        },
      },
    );

    console.log(`✅ ${toolName} complete for node ${nodeId}`);
    return describeResult(result);
  } catch (error) {
    console.error(`${toolName} tool error:`, error);
    return toolError(error instanceof Error ? error.message : String(error));
  }
}

/**
 * Parse a BlockNote XML payload, enforcing how many top-level blocks the caller
 * accepts. Throws with an agent-readable message so `runBlockNoteEdit` shapes it.
 */
async function parseXmlBlocks(
  xml: string,
  { exactlyOne }: { exactlyOne?: boolean } = {},
) {
  const blocks = await parseBlockNoteXml(xml);
  if (blocks.length === 0) {
    throw new Error("The provided XML produced no blocks.");
  }
  if (exactlyOne && blocks.length > 1) {
    throw new Error(
      `replace_block expects exactly one block but the XML contained ${blocks.length}. Use insert_blocks to add multiple blocks.`,
    );
  }
  return blocks;
}

// ── insert_blocks ───────────────────────────────────────────────────────────

export const blocknoteInsertBlocksToolConfig: ToolConfig = {
  name: "insert_blocks",
  authorized_agents: [...BLOCKNOTE_AGENTS],
  mcp: { access: "write" },
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
    blocks: z.string().describe(XML_PAYLOAD_HINT("one or more <block> elements")),
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
  return createTool({
    description:
      'Insert new block(s) into a blocknote node. `blocks` is one or more BlockNote XML v1 <block> elements — the <blocknote> wrapper is optional, so you can either copy blocks straight from read_nodes output or write bare <block> elements. Use position "start"/"end" or "before"/"after" a reference block id. Do not write id attributes: every inserted block gets a fresh server-assigned id, so re-read the node before addressing an inserted block by id.',
    inputSchema: insertBlocksSchema,
    execute: (ctx, input): Promise<string> =>
      runBlockNoteEdit({
        ctx,
        threadCtx,
        toolName: "insert_blocks",
        nodeId: input.nodeId,
        logSuffix: `pos=${input.position}`,
        buildEdit: async () => ({
          kind: "insert",
          position: input.position,
          referenceBlockId: input.referenceBlockId,
          blocks: await parseXmlBlocks(input.blocks),
        }),
        // The ids are deliberately NOT echoed back: a fresh nanoid per block is
        // pure token cost on every insert, and an agent that needs to address
        // one has to re-read the node anyway (the insert may have been
        // reshaped by a concurrent edit).
        describeResult: ({ insertedBlockIds = [] }) =>
          `Inserted ${insertedBlockIds.length} block(s).`,
      }),
  });
}

// ── replace_block ───────────────────────────────────────────────────────────

export const blocknoteReplaceBlockToolConfig: ToolConfig = {
  name: "replace_block",
  authorized_agents: [...BLOCKNOTE_AGENTS],
  mcp: { access: "write" },
};

function blocknoteReplaceBlockTool({ threadCtx }: { threadCtx: ThreadCtx }) {
  return createTool({
    description:
      "Replace a single block (by id) with new content. `block` is exactly one BlockNote XML v1 <block> element — the <blocknote> wrapper is optional. The target block id is preserved whether or not you write it. Keep the id attribute on descendants you want to preserve; omit it on new ones, which get fresh ids. For props-only edits prefer update_block_props; for surgical text edits prefer patch_block_text.",
    inputSchema: z.object({
      nodeId: NODE_ID_FIELD,
      blockId: BLOCK_ID_FIELD("to replace"),
      block: z
        .string()
        .describe(
          XML_PAYLOAD_HINT("exactly one top-level <block> element (the replacement)"),
        ),
      explanation: EXPLANATION_FIELD,
    }),
    execute: (ctx, input): Promise<string> =>
      runBlockNoteEdit({
        ctx,
        threadCtx,
        toolName: "replace_block",
        nodeId: input.nodeId,
        logSuffix: `blockId=${input.blockId}`,
        buildEdit: async () => ({
          kind: "replace",
          blockId: input.blockId,
          block: (await parseXmlBlocks(input.block, { exactlyOne: true }))[0],
        }),
        describeResult: () => `Replaced block "${input.blockId}".`,
      }),
  });
}

// ── delete_blocks ───────────────────────────────────────────────────────────

export const blocknoteDeleteBlocksToolConfig: ToolConfig = {
  name: "delete_blocks",
  authorized_agents: [...BLOCKNOTE_AGENTS],
  mcp: { access: "write" },
};

function blocknoteDeleteBlocksTool({ threadCtx }: { threadCtx: ThreadCtx }) {
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
    execute: (ctx, input): Promise<string> =>
      runBlockNoteEdit({
        ctx,
        threadCtx,
        toolName: "delete_blocks",
        nodeId: input.nodeId,
        logSuffix: `ids=${input.blockIds.join(", ")}`,
        buildEdit: () => ({ kind: "delete", blockIds: input.blockIds }),
        describeResult: ({ deletedCount }) =>
          `Deleted ${deletedCount ?? input.blockIds.length} block(s): ${input.blockIds.join(", ")}.`,
      }),
  });
}

// ── update_block_props ──────────────────────────────────────────────────────

export const blocknoteUpdateBlockPropsToolConfig: ToolConfig = {
  name: "update_block_props",
  authorized_agents: [...BLOCKNOTE_AGENTS],
  mcp: { access: "write" },
};

function blocknoteUpdateBlockPropsTool({ threadCtx }: { threadCtx: ThreadCtx }) {
  return createTool({
    description:
      "Patch the props of a single block (by id) without touching its content or children. Merges the provided props onto the existing ones (only provided keys overwrite). Use this to change a heading level, text color, background color, alignment, etc.",
    inputSchema: z.object({
      nodeId: NODE_ID_FIELD,
      blockId: BLOCK_ID_FIELD("whose props to update"),
      propsPatch: z
        .record(z.string(), z.unknown())
        .describe(
          'Partial props to merge, e.g. {"level":2}, {"textColor":"blue"}, {"textAlignment":"center"}. Only provided keys overwrite; others are preserved.',
        ),
      explanation: EXPLANATION_FIELD,
    }),
    execute: (ctx, input): Promise<string> =>
      runBlockNoteEdit({
        ctx,
        threadCtx,
        toolName: "update_block_props",
        nodeId: input.nodeId,
        logSuffix: `blockId=${input.blockId}`,
        buildEdit: () => ({
          kind: "updateProps",
          blockId: input.blockId,
          propsPatch: input.propsPatch,
        }),
        describeResult: () =>
          `Updated props of block "${input.blockId}". New props: ${JSON.stringify(input.propsPatch)} merged onto existing.`,
      }),
  });
}

// ── patch_block_text ────────────────────────────────────────────────────────

export const blocknotePatchBlockTextToolConfig: ToolConfig = {
  name: "patch_block_text",
  authorized_agents: [...BLOCKNOTE_AGENTS],
  mcp: { access: "write" },
};

function blocknotePatchBlockTextTool({ threadCtx }: { threadCtx: ThreadCtx }) {
  return createTool({
    description:
      "Surgically replace an exact literal substring inside a single block's visible text (by block id). The match is scoped to that one block only, so a substring that appears many times in the document is safe as long as it is unique within the chosen block. Operates on the native inline content: styles, links and props outside the match are preserved. The match must not cross a link boundary or a non-text inline node — use replace_block for those. Prefer replace_block for edits that change block type/structure.",
    inputSchema: z.object({
      nodeId: NODE_ID_FIELD,
      blockId: BLOCK_ID_FIELD("whose text to patch"),
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
    execute: (ctx, input): Promise<string> =>
      runBlockNoteEdit({
        ctx,
        threadCtx,
        toolName: "patch_block_text",
        nodeId: input.nodeId,
        logSuffix: `blockId=${input.blockId}`,
        buildEdit: () => ({
          kind: "patchText",
          blockId: input.blockId,
          oldString: input.old_string,
          newString: input.new_string,
        }),
        describeResult: () => `Patched text in block "${input.blockId}".`,
      }),
  });
}

// ── Registry entry ───────────────────────────────────────────────────────────

type ToolFactoryContext = { agentName: ToolAgentName; threadCtx: ThreadCtx };

export const blockNoteToolDefinitions: Array<{
  config: ToolConfig;
  factory: (context: ToolFactoryContext) => AgentTool | null;
}> = (
  [
    [blocknoteInsertBlocksToolConfig, blocknoteInsertBlocksTool],
    [blocknoteReplaceBlockToolConfig, blocknoteReplaceBlockTool],
    [blocknoteDeleteBlocksToolConfig, blocknoteDeleteBlocksTool],
    [blocknoteUpdateBlockPropsToolConfig, blocknoteUpdateBlockPropsTool],
    [blocknotePatchBlockTextToolConfig, blocknotePatchBlockTextTool],
  ] as const
).map(([config, build]) => ({
  config,
  factory: ({ threadCtx }: ToolFactoryContext) => build({ threadCtx }),
}));
