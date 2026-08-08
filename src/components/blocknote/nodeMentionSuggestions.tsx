import { filterSuggestionItems } from "@blocknote/core";
import type { DefaultReactSuggestionItem } from "@blocknote/react";

import { getNodeDataTitle } from "@/../convex/lib/getNodeDataTitle";
import { NODE_TYPE_ICON_MAP } from "@/components/nodes/prebuilt-nodes/nodeIconMap";
import { useNodeDataStore } from "@/stores/nodeDataStore";
import { useTemplatesStore } from "@/stores/templatesStore";
import type { AppBlockNoteEditor } from "./schema";

const MAX_NODE_MENTION_SUGGESTIONS = 20;

/**
 * Suggestion items for the `@` mention trigger (see BlocknoteWindow.tsx):
 * every node on the open canvas, most recently updated first, filtered by
 * `query`. No backend request — `nodeDataStore` only ever holds the current
 * canvas's node data (see nodeDatas.listByCanvasId), so filtering the
 * already-synced local store is both correct and free.
 *
 * `getState()` reads (not hooks): this runs from inside `getItems`, an async
 * callback rather than a render, same pattern as the slash menu's item
 * builders and messageContextGenerator's `getNodeTitle`.
 */
export function getNodeMentionSuggestionItems(
  editor: AppBlockNoteEditor,
  query: string,
): DefaultReactSuggestionItem[] {
  const { nodeDatas } = useNodeDataStore.getState();
  const { templates } = useTemplatesStore.getState();

  const items: DefaultReactSuggestionItem[] = Array.from(nodeDatas.values())
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
    .map((nodeData) => {
      const template = nodeData.templateId
        ? templates.get(nodeData.templateId)
        : undefined;
      const title = getNodeDataTitle(nodeData, template ?? null);
      const Icon = NODE_TYPE_ICON_MAP[nodeData.type] ?? NODE_TYPE_ICON_MAP.title;

      return {
        title,
        subtext: nodeData.type,
        icon: <Icon size={18} />,
        onItemClick: () => {
          editor.insertInlineContent([
            { type: "mention", props: { nodeDataId: nodeData._id, title } },
            " ",
          ]);
        },
      };
    });

  return filterSuggestionItems(items, query).slice(
    0,
    MAX_NODE_MENTION_SUGGESTIONS,
  );
}
