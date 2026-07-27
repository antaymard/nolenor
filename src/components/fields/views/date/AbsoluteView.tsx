import { TbCalendar } from "react-icons/tb";
import { formatAbsoluteDate } from "@/components/fields/shared/dateFormat";
import type { FieldViewProps } from "@/components/fields/fieldHostTypes";

export default function DateAbsoluteView({ value }: FieldViewProps) {
  const displayValue = formatAbsoluteDate(value);

  return (
    <span className="flex items-center gap-1 min-w-0 flex-1 text-sm px-0.5 py-0.5">
      <TbCalendar size={13} className="shrink-0 text-muted-foreground" />
      {displayValue ? (
        <span className="truncate">{displayValue}</span>
      ) : (
        <span className="text-muted-foreground/60 italic truncate">
          Pick a date…
        </span>
      )}
    </span>
  );
}
