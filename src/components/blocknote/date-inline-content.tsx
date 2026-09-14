import { createReactInlineContentSpec } from "@blocknote/react";

import {
  parseDatePillValue,
  toIsoDateString,
} from "@/../convex/lib/datePill";
import { cn } from "@/lib/utils";
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

/**
 * Same labels as the Plate.js date pill this replaced.
 * Accepts both the canonical ISO value and legacy `toDateString()` values.
 */
export function formatDatePillLabel(date: string): string {
  const elementDate = parseDatePillValue(date);
  if (!elementDate) return "Pick a date";
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

const pillBaseClassName = "w-fit rounded-sm px-1";

export type DatePillTone = "today" | "overdue" | "soon" | "default";

/**
 * Couleur de la pill selon l'écart calendaire à aujourd'hui (temps local) :
 *   - today   (jour même)                  → bleu
 *   - overdue (dépassée depuis ≤ 7 jours)  → rouge
 *   - soon    (à venir dans 1 à 3 jours)   → jaune (amber, meilleur contraste)
 *   - default (sinon : loin devant, dépassée depuis > 7 j, ou illisible) → gris
 */
export function getDatePillTone(date: string): DatePillTone {
  const elementDate = parseDatePillValue(date);
  if (!elementDate) return "default";
  const diffDays = Math.round(
    (startOfDay(elementDate) - startOfDay(new Date())) / DAY_MS,
  );
  if (diffDays === 0) return "today";
  if (diffDays < 0) return diffDays >= -7 ? "overdue" : "default";
  return diffDays <= 3 ? "soon" : "default";
}

const pillToneClassName: Record<DatePillTone, string> = {
  today: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
  overdue: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  soon: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  default: "bg-muted text-muted-foreground",
};

export function getDatePillClassName(date?: string): string {
  return cn(pillBaseClassName, pillToneClassName[getDatePillTone(date ?? "")]);
}

/**
 * Static (read-only) rendering of the date pill: a plain span with the human
 * label, no popover. Used by the canvas read-only renderer (BlockNoteStatic)
 * AND by the spec's `toExternalHTML` (clipboard / HTML export) so the two
 * surfaces never diverge.
 */
export function DatePillView({ date }: { date?: string }) {
  return (
    <span className={getDatePillClassName(date)}>
      {formatDatePillLabel(date ?? "")}
    </span>
  );
}

/**
 * Date pill inline content (inserted via `/date` in the slash menu). Stored in
 * the document as `{ type: "date", props: { date: "YYYY-MM-DD" } }`. Legacy
 * documents hold a `toDateString()` value instead; both are read (see
 * convex/lib/datePill.ts), and only ISO is written.
 *
 * `render` is used inside the editable editor: interactive popover + calendar,
 * same UX as the Plate.js date pill. `toExternalHTML` is used for static HTML
 * serialization (clipboard export and the headless editor rendering canvas node
 * previews in BlocknoteNode.tsx): a plain span, no popover, via `DatePillView`.
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
          <span
            className={cn(
              getDatePillClassName(props.inlineContent.props.date),
              "cursor-pointer",
            )}
          >
            {formatDatePillLabel(props.inlineContent.props.date)}
          </span>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0">
          <Calendar
            mode="single"
            selected={parseDatePillValue(props.inlineContent.props.date) ?? undefined}
            onSelect={(date) => {
              if (!date) return;
              props.updateInlineContent({
                type: "date",
                props: { date: toIsoDateString(date) },
              });
            }}
            autoFocus
          />
        </PopoverContent>
      </Popover>
    ),
    toExternalHTML: (props) => (
      <DatePillView date={props.inlineContent.props.date} />
    ),
  },
);
