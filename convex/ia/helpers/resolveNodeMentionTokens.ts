// Resolution of the `[[node:<nodeId>]]` mention tokens an agent writes.
//
// The codec (`blockNoteMarkdown.ts`) is pure: it can turn a token into a
// `mention` pill, but only if it is handed the `nodeId → { nodeDataId, title }`
// correspondence, which lives in the canvas document. This module is that
// lookup. Only the nodes the agent actually named are fetched, so a payload
// with no token costs nothing.
//
// The lookup itself is lenient — an id it cannot resolve simply stays out of
// the map. Whether that is an error is decided AFTER parsing, by asking the
// codec which tokens survived as plain text (`findUnresolvedMentionTokens`):
// only then is a token in a code span, which is literal text on purpose, told
// apart from a real typo. A real one is refused, the same answer `node` table
// cells already give (`tableCellValidation.ts`), rather than persisted as
// visible debris in the user's document.

import type { ToolCtx } from "@convex-dev/agent";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { getNodeDataTitle } from "../../lib/getNodeDataTitle";
import {
  collectNodeMentionTokenIds,
  type ResolvedMentionByNodeId,
} from "./blockNoteMarkdown";

/**
 * Resolve every `[[node:…]]` token in a raw agent payload (Markdown or
 * BlockNote XML) against `canvasId`.
 *
 * The title is read now rather than trusted from the token's own label: the
 * label is decorative, and what lands in the pill's props is the fallback the
 * frontend shows if that node ever leaves the canvas — so it must be true at
 * write time.
 */
export async function resolveNodeMentionTokens(
  ctx: ToolCtx,
  canvasId: Id<"canvases">,
  text: string,
): Promise<ResolvedMentionByNodeId> {
  const nodeIds = collectNodeMentionTokenIds(text);
  if (nodeIds.length === 0) return new Map();

  const resolved = await Promise.all(
    nodeIds.map(async (nodeId) => {
      try {
        const { nodeData } = await ctx.runQuery(
          internal.wrappers.canvasNodeWrappers.getNodeWithNodeData,
          { canvasId, nodeId },
        );
        const template = nodeData.templateId
          ? await ctx.runQuery(
              internal.wrappers.nodeTemplateWrappers.getTemplate,
              { templateId: nodeData.templateId },
            )
          : null;
        return {
          nodeId,
          nodeDataId: String(nodeData._id),
          title: getNodeDataTitle(nodeData, template),
        };
      } catch {
        // Every failure mode of the lookup — no such node, no nodeData attached
        // — means the same thing to the agent: that id is not usable here.
        return { nodeId, nodeDataId: null, title: "" };
      }
    }),
  );

  return new Map(
    resolved
      .filter((r): r is typeof r & { nodeDataId: string } => r.nodeDataId !== null)
      .map((r) => [r.nodeId, { nodeDataId: r.nodeDataId, title: r.title }]),
  );
}

/**
 * The tool error for mention tokens that reached the parsed document as text.
 * Names the offending ids and the way out, so the retry is a lookup rather than
 * another guess.
 */
export function unresolvedMentionTokensError(nodeIds: string[]): string {
  const names = nodeIds.map((id) => `"${id}"`).join(", ");
  return (
    `Mention token${nodeIds.length > 1 ? "s" : ""} ${names} could not be resolved: ` +
    `no such node on the current canvas. Use list_nodes to find a valid nodeId, ` +
    `or write the text plainly instead of a [[node:…]] token ` +
    "(wrap it in a code span to show the literal syntax)."
  );
}
