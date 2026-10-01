import { TbTag } from "react-icons/tb";
import type { DefaultReactSuggestionItem } from "@blocknote/react";

import {
  PILL_DEFAULT_COLOR,
  PILL_DEFAULT_TEXT,
  PILL_DEFAULT_VARIANT,
} from "@/../convex/lib/colorPill";
import type { AppBlockNoteEditor } from "./schema";

/**
 * Slash menu item (`/pill`) inserting a colored pill. Clicking the pill opens
 * a popover to change its text, color and variant.
 */
export function getPillSlashMenuItem(
  editor: AppBlockNoteEditor,
): DefaultReactSuggestionItem {
  return {
    title: "Pill",
    onItemClick: () => {
      editor.insertInlineContent([
        {
          type: "pill",
          props: {
            text: PILL_DEFAULT_TEXT,
            color: PILL_DEFAULT_COLOR,
            variant: PILL_DEFAULT_VARIANT,
          },
        },
        " ",
      ]);
    },
    aliases: ["pill", "status", "tag", "label", "badge", "lozenge"],
    group: "Others",
    icon: <TbTag size={18} />,
    subtext: "Insert a colored pill",
  };
}
