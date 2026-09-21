import { filterSuggestionItems } from "@blocknote/core";
import type { DefaultReactSuggestionItem } from "@blocknote/react";

import type { Id } from "@/../convex/_generated/dataModel";
import { getNodeDataTitle } from "@/../convex/lib/getNodeDataTitle";
import { NODE_TYPE_ICON_MAP } from "@/components/nodes/prebuilt-nodes/nodeIconMap";
import { formatDistanceToNowStrict } from "@/lib/date-utils";
import { useNodeDataStore } from "@/stores/nodeDataStore";
import { useTemplatesStore } from "@/stores/templatesStore";
import type { AppBlockNoteEditor } from "./schema";
import { getNodeCapabilities } from "@/../convex/config/nodeConfig";

const MAX_NODE_MENTION_SUGGESTIONS = 20;

/**
 * Un item du menu `@`, porteur de son identité.
 *
 * `DefaultReactSuggestionItem` n'a pas d'id, et le menu par défaut de
 * `@blocknote/react` keye ses lignes sur `item.title` : deux nodes qui portent
 * le même titre — cinq frames sans nom rendent toutes « Frame » — donnent deux
 * enfants de MÊME clé React, donc une réconciliation de travers et un
 * surlignage qui saute le bloc au clavier. D'où ce champ, et `NodeMentionMenu`
 * qui keye dessus.
 */
export type NodeMentionItem = DefaultReactSuggestionItem & {
  nodeDataId: Id<"nodeDatas">;
};

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
): NodeMentionItem[] {
  const { nodeDatas } = useNodeDataStore.getState();
  const { templates } = useTemplatesStore.getState();

  const items: NodeMentionItem[] = Array.from(nodeDatas.values())
    // Types non mentionnables (cf. `capabilities` dans nodeConfig) : une pill
    // vers eux n'aurait rien à porter, et l'agent qui la relirait verrait un
    // node dont tout le reste lui est masqué.
    .filter((nodeData) => getNodeCapabilities(nodeData.type).mentionable)
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
    .map((nodeData) => {
      const template = nodeData.templateId
        ? templates.get(nodeData.templateId)
        : undefined;
      const title = getNodeDataTitle(nodeData, template ?? null);
      const Icon = NODE_TYPE_ICON_MAP[nodeData.type] ?? NODE_TYPE_ICON_MAP.title;

      return {
        nodeDataId: nodeData._id,
        title,
        // Le type ET la date de dernière modification. Le type seul répétait
        // souvent le titre (une frame sans nom lit « Frame » / « frame ») sans
        // rien apprendre ; la date distingue deux nodes de même type et rend
        // lisible l'ordre de la liste, qui est déjà celui-là.
        subtext: nodeData.updatedAt
          ? `${nodeData.type} · ${formatDistanceToNowStrict(
              new Date(nodeData.updatedAt),
              { addSuffix: true },
            )}`
          : nodeData.type,
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
