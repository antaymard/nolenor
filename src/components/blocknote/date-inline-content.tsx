import { createReactInlineContentSpec } from "@blocknote/react";

import { Calendar } from "@/components/shadcn/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/shadcn/popover";

const TODAY = "Today";
const YESTERDAY = "Yesterday";
const TOMORROW = "Tomorrow";

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Same labels as the Plate.js date pill (src/components/plate/date-node.tsx). */
export function formatDatePillLabel(date: string): string {
  if (!date) return "Pick a date";
  const elementDate = new Date(date);
  if (Number.isNaN(elementDate.getTime())) return "Pick a date";
  const diff = startOfDay(elementDate) - startOfDay(new Date());
  if (diff === 0) return TODAY;
  if (diff === -DAY_MS) return YESTERDAY;
  if (diff === DAY_MS) return TOMORROW;
  return elementDate.toLocaleDateString("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

const pillClassName =
  "w-fit cursor-pointer rounded-sm bg-muted px-1 text-muted-foreground";

/**
 * Date pill inline content (inserted via `/date` in the slash menu). Stored in
 * the document as `{ type: "date", props: { date: <Date.toDateString()> } }`.
 *
 * `render` is used inside the editable editor: interactive popover + calendar,
 * same UX as the Plate.js date pill. `toExternalHTML` is used for static HTML
 * serialization (clipboard export and the headless editor rendering canvas
 * node previews in BlocknoteNode.tsx): a plain span, no popover.
 */
export const dateInlineContentSpec = createReactInlineContentSpec(
  {
    type: "date",
    propSchema: {
      date: { default: "" },
    },
    content: "none",
  },
  {
    render: (props) => (
      <Popover>
        <PopoverTrigger asChild>
          <span className={pillClassName}>
            {formatDatePillLabel(props.inlineContent.props.date)}
          </span>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0">
          <Calendar
            mode="single"
            selected={
              props.inlineContent.props.date
                ? new Date(props.inlineContent.props.date)
                : undefined
            }
            onSelect={(date) => {
              if (!date) return;
              props.updateInlineContent({
                type: "date",
                props: { date: date.toDateString() },
              });
            }}
            initialFocus
          />
        </PopoverContent>
      </Popover>
    ),
    toExternalHTML: (props) => (
      <span className={pillClassName}>
        {formatDatePillLabel(props.inlineContent.props.date)}
      </span>
    ),
  },
);
