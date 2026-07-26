import { TbCalendar } from "react-icons/tb";
import { formatDistanceToNow } from "@/lib/date-utils";
import { parseIsoDate } from "@/components/fields/shared/dateFormat";
import type { FieldViewProps } from "@/components/fields/fieldHostTypes";

export default function DateRelativeView({ value }: FieldViewProps) {
  const date = parseIsoDate(value);

  return (
    <span className="flex items-center gap-1 min-w-0 flex-1 text-sm px-0.5 py-0.5">
      <TbCalendar size={13} className="shrink-0 text-muted-foreground" />
      {date ? (
        // Date absolue en title : le relatif seul ("in 3 days") est ambigu
        // dès qu'on veut la date exacte.
        <span className="truncate" title={date.toLocaleDateString()}>
          {formatDistanceToNow(date, { addSuffix: true })}
        </span>
      ) : (
        <span className="text-muted-foreground/60 italic truncate">
          Pick a date…
        </span>
      )}
    </span>
  );
}
