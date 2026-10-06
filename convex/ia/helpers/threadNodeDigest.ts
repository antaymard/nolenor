import { v } from "convex/values";
import type { Id } from "../../_generated/dataModel";
import { internalQuery } from "../../_generated/server";
import { getNodeDataTitle } from "../../lib/getNodeDataTitle";
import { escapeXmlAttribute } from "../../lib/xml";
import * as NodeModels from "../../models/nodeModels";
import * as ThreadMetadataModels from "../../models/threadMetadataModels";
import { targetNodeIds } from "../../harness/runWrites";
import { agentTaskKinds } from "../../schemas/agentTasksSchema";

const MAX_RUNS = 50;
const MAX_TOOLS_PER_RUN = 200;
const MAX_LISTED = 40;

/**
 * Les nodes qu'un thread a lus, créés et modifiés, sur toute sa durée : ce
 * qu'un résumé de compaction ne doit pas perdre, et que la harness sait
 * mieux que le LLM qui résume. Recalculé à chaque compaction, donc cumulatif.
 */
export const threadNodeDigest = internalQuery({
  args: { threadId: v.string() },
  returns: v.string(),
  handler: async (ctx, { threadId }) => {
    const read = new Set<string>();
    const modified = new Set<string>();
    const runs = await ctx.db
      .query("runPrompts")
      .withIndex("by_threadId", (q) => q.eq("threadId", threadId))
      .order("desc")
      .take(MAX_RUNS);
    for (const run of runs) {
      const tools = await ctx.db
        .query("agentTasks")
        .withIndex("by_runMessageId_and_kind", (q) =>
          q.eq("runMessageId", run.messageId).eq("kind", agentTaskKinds.tool),
        )
        .take(MAX_TOOLS_PER_RUN);
      for (const tool of tools) {
        if (tool.status !== "completed") continue;
        const target = tool.replay === "safe" ? read : modified;
        for (const id of targetNodeIds(tool.input)) target.add(id);
      }
    }

    const created = new Set<string>();
    const thread = await ThreadMetadataModels.findByThreadId(ctx, { threadId });
    for (const touch of thread?.touchedNodes ?? []) {
      if (touch.kind === "deleted") continue;
      const node = await NodeModels.getNodeByNodeDataId(ctx, {
        nodeDataId: touch.nodeDataId,
      });
      if (!node) continue;
      (touch.kind === "created" ? created : modified).add(node.id);
    }
    for (const id of created) modified.delete(id);
    for (const id of [...created, ...modified]) read.delete(id);

    const describe = async (ids: Set<string>) => {
      const lines: string[] = [];
      for (const nodeId of [...ids].slice(0, MAX_LISTED)) {
        const node = await NodeModels.getNodeByLlmId(ctx, { nodeId });
        if (!node || node.status === "trashed") continue;
        const data = await ctx.db.get(
          "nodeDatas",
          node.nodeDataId as Id<"nodeDatas">,
        );
        const title = data ? getNodeDataTitle(data) : "";
        lines.push(
          `<node id="${node.id}" type="${node.type}" title="${escapeXmlAttribute(title)}"/>`,
        );
      }
      if (ids.size > MAX_LISTED) lines.push(`… and ${ids.size - MAX_LISTED} more`);
      return lines.join("\n");
    };

    const sections = [
      ["created_nodes", await describe(created)],
      ["modified_nodes", await describe(modified)],
      ["read_nodes", await describe(read)],
    ].filter(([, body]) => body);
    if (sections.length === 0) return "";
    return [
      '<nodes hint="Tracked by the app over the whole conversation, summarized part included.">',
      ...sections.map(([tag, body]) => `<${tag}>\n${body}\n</${tag}>`),
      "</nodes>",
    ].join("\n");
  },
});
