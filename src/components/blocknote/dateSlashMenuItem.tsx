import { TbCalendar } from "react-icons/tb";
import type { DefaultReactSuggestionItem } from "@blocknote/react";

import { toIsoDateString } from "@/../convex/lib/datePill";
import type { AppBlockNoteEditor } from "./schema";

/**
 * Slash menu item (`/date`) inserting a date pill pre-filled with today.
 * Clicking the pill opens a calendar to change the date.
 */
export function getDateSlashMenuItem(
  editor: AppBlockNoteEditor,
): DefaultReactSuggestionItem {
  return {
    title: "Date",
    onItemClick: () => {
      editor.insertInlineContent([
        { type: "date", props: { date: toIsoDateString(new Date()) } },
        " ",
      ]);
    },
    aliases: ["date", "calendar", "📅"],
    group: "Others",
    icon: <TbCalendar size={18} />,
    subtext: "Insert a date pill",
  };
}
