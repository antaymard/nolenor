import { insertOrUpdateBlockForSlashMenu } from "@blocknote/core";
import { TbMessage } from "react-icons/tb";
import type { DefaultReactSuggestionItem } from "@blocknote/react";

import type { AppBlockNoteEditor } from "./schema";

/**
 * Slash menu item (`/callout`) converting the current block into a callout
 * (colored box with clickable emoji icon), same as the default block items.
 */
export function getCalloutSlashMenuItem(
  editor: AppBlockNoteEditor,
): DefaultReactSuggestionItem {
  return {
    title: "Callout",
    onItemClick: () => {
      insertOrUpdateBlockForSlashMenu(editor, { type: "callout" });
    },
    aliases: ["callout", "note", "warning", "info", "astuce"],
    group: "Basic blocks",
    icon: <TbMessage size={18} />,
    subtext: "Insert a colored callout with an icon",
  };
}
