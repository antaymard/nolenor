import { useState } from "react";
import { TbCalendar, TbX } from "react-icons/tb";
import { Calendar } from "@/components/shadcn/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/shadcn/popover";
import { cn } from "@/lib/utils";
import type { FieldRenderProps } from "@/components/fields/registry/fieldRegistry";

// Stockage en ISO date ("YYYY-MM-DD") — cf. fieldConfig.
function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export default function DateField({ value, onCommit }: FieldRenderProps) {
  const [open, setOpen] = useState(false);

  const iso = typeof value === "string" && value.length > 0 ? value : undefined;
  const dateValue = iso ? new Date(iso) : undefined;
  const displayValue =
    dateValue && !Number.isNaN(dateValue.getTime())
      ? dateValue.toLocaleDateString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
        })
      : undefined;

  const trigger = (
    <span
      className={cn(
        "nodrag flex items-center gap-1 w-full min-w-0 text-sm rounded px-0.5 py-0.5",
        onCommit && "cursor-pointer hover:bg-black/5",
      )}
      onClick={(e) => {
        if (!onCommit) return;
        e.stopPropagation();
        setOpen(true);
      }}
    >
      <TbCalendar size={13} className="shrink-0 text-muted-foreground" />
      {displayValue ? (
        <span className="truncate">{displayValue}</span>
      ) : (
        <span className="text-muted-foreground/60 italic truncate">
          Pick a date…
        </span>
      )}
      {displayValue && onCommit && (
        <button
          type="button"
          className="ml-auto shrink-0 opacity-40 hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            onCommit(undefined);
          }}
        >
          <TbX size={12} />
        </button>
      )}
    </span>
  );

  if (!onCommit) return trigger;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-auto p-0 nodrag" align="start">
        <Calendar
          mode="single"
          selected={dateValue}
          onSelect={(date) => {
            if (date) onCommit(toIsoDate(date));
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
