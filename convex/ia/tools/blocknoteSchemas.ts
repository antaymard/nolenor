// Shared tool descriptions for BlockNote editing tools.
//
// The LLM reads documents in annotated markdown format:
//   <block id="abc" type="heading" props='{"level":3,"textColor":"blue"}'>My **colored** heading</block>
//
// The write tools accept the SAME format — copy a block from read_nodes output,
// modify the text, and send it back. This read/write symmetry eliminates the
// need for the LLM to translate between two representations. Plain markdown
// (no <block> tags) is also accepted as a lossy fallback.

export const REPLACE_BLOCK_DESCRIPTION = `Replace a single block (by id) inside a blocknote node.

The \`block\` parameter is an annotated markdown string — the SAME format you see in read_nodes output:
  <block type="heading" props='{"level":3,"textColor":"blue"}'>My **colored** heading</block>

Copy the block from read_nodes, change the text, and send it back. The id attribute is ignored (a fresh id is assigned).

You can also send plain markdown (no <block> tags) for simple text-only blocks — this is lossy (colors, alignment, and other props are lost).

Use replace_block to change type, props, or content. For props-only edits, prefer update_block_props. For surgical text edits within a block, prefer patch_block_text.`;

export const INSERT_BLOCKS_DESCRIPTION = `Insert new blocks into a blocknote node relative to a reference block id (or at the start/end of the document).

The \`blocks\` parameter is an annotated markdown string — the SAME format you see in read_nodes output. Multiple blocks are separated by blank lines:
  <block type="heading" props='{"level":2}'>## Section</block>

  <block type="paragraph">Body text with **bold** and [a link](https://example.com).</block>

  <block type="bulletListItem">* Item with **bold**
    <block type="bulletListItem">* Nested item</block>
  </block>

You can also send plain markdown (no <block> tags) for simple text-only blocks — this is lossy (colors, alignment, and other props are lost).

Use position "before"/"after" a reference block id, or reference "START"/"END" to prepend/append. New blocks get fresh ids.`;
