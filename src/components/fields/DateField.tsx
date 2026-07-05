import type { BaseFieldProps } from "@/types/ui";
import { memo, useCallback, useMemo } from "react";
import { Calendar } from "../shadcn/calendar";
import { cn } from "@/lib/utils";
import { TbCalendarTime, TbClock } from "react-icons/tb";
import { Tooltip, TooltipContent, TooltipTrigger } from "../shadcn/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "../shadcn/popover";
import { Label } from "../shadcn/label";
import { Input } from "../shadcn/input";
import { format, formatDistanceToNow } from "@/lib/date-utils";

interface DateFieldProps extends BaseFieldProps<number | Date> {
  className?: string;
}

function formatAbsoluteDate(date: Date, includeTime: boolean): string {
  if (!date) {
    return "-";
  }

  if (includeTime) {
    return format(date, "EEE dd MMM yyyy 'at' HH:mm");
  }
  return format(date, "EEE dd MMM yyyy");
}

function renderRelativeDate(
  date: Date | undefined,
  formatType: "automatic" | "weeks" | "days"
): string {
  if (!date) {
    return "-";
  }

  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const absDiffMs = Math.abs(diffMs);

  const day = 24 * 60 * 60 * 1000;
  const week = 7 * day;

  // Mode "days" : toujours afficher en jours
  if (formatType === "days") {
    const days = Math.round(absDiffMs / day);
    const unit = days > 1 ? "days" : "day";
    return diffMs < 0 ? `${days} ${unit} ago` : `In ${days} ${unit}`;
  }

  // Mode "weeks" : toujours afficher en semaines
  if (formatType === "weeks") {
    const weeks = Math.round(absDiffMs / week);
    const unit = weeks > 1 ? "weeks" : "week";
    return diffMs < 0 ? `${weeks} ${unit} ago` : `In ${weeks} ${unit}`;
  }

  // Mode "automatic" : utiliser formatDistanceToNow avec limite de 90 jours
  if (absDiffMs < 90 * day) {
    const distance = formatDistanceToNow(date, {
      addSuffix: true,
    });
    // Première lettre en majuscule
    return distance.charAt(0).toUpperCase() + distance.slice(1);
  }

  // Au-delà de 90 jours, afficher en mois/années
  const distance = formatDistanceToNow(date, {
    addSuffix: true,
  });
  return distance.charAt(0).toUpperCase() + distance.slice(1);
}

function DateField({
  field,
  value,
  onChange,
  visualSettings,
  componentProps,
  className = "",
}: DateFieldProps) {
  const isDateTime = field?.options?.isDateTime as boolean;
  const isRelative = componentProps?.isRelative as boolean;

  // Convert value to Date if it's a timestamp
  const dateValue = useMemo(() => {
    if (value === undefined || value === null) return undefined;
    return value instanceof Date ? value : new Date(value);
  }, [value]);

  const handleSave = useCallback(
    (newValue: Date) => {
      if (onChange) {
        // Save as timestamp (number) for Convex compatibility
        onChange(newValue.getTime());
      }
    },
    [onChange]
  );

  if (isRelative) {
    // Affichage de la date en format relatif (ex: "il y a 3 jours", "dans 2 semaines", etc.)
    // Selon le setting "format" (automatic, weeks, days)

    const format = visualSettings?.format as
      | "automatic"
      | "weeks"
      | "days"
      | undefined;
    const relativeText = renderRelativeDate(dateValue, format || "automatic");
    return (
      <Popover>
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <div
                className={cn(
                  "relative bg-muted hover:bg-accent h-8 rounded-md flex items-center group/datefield px-2 gap-2 min-w-0",
                  className
                )}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <TbCalendarTime size={18} className="shrink-0" />
                  <p className="truncate flex-1 min-w-0">{relativeText}</p>
                </div>
              </div>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>{dateValue?.toLocaleString() || "-"}</TooltipContent>
        </Tooltip>
        <PopoverContent>
          <CalendarWithTiem
            selected={dateValue}
            onSelect={handleSave}
            showTime={isDateTime}
          />
        </PopoverContent>
      </Popover>
    );
  } else {
    // Affichage de la date en format absolu (ex: "12 mars 2024", "12 mars 2024 à 14:30", etc.)
    const absoluteText = formatAbsoluteDate(dateValue, isDateTime);
    const relativeText = dateValue
      ? renderRelativeDate(dateValue, "automatic")
      : "-";

    return (
      <Popover>
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <div
                className={cn(
                  "relative bg-muted hover:bg-accent h-8 rounded-md flex items-center group/datefield px-2 gap-2 min-w-0",
                  className
                )}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <TbCalendarTime size={18} className="shrink-0" />
                  <p className="truncate flex-1 min-w-0">{absoluteText}</p>
                </div>
              </div>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>{relativeText}</TooltipContent>
        </Tooltip>
        <PopoverContent>
          <CalendarWithTiem
            selected={dateValue}
            onSelect={handleSave}
            showTime={isDateTime}
          />
        </PopoverContent>
      </Popover>
    );
  }
}

function CalendarWithTiem({
  selected,
  onSelect,
  showTime = false,
}: {
  selected: Date | undefined;
  onSelect: (date: Date) => void;
  showTime?: boolean;
}) {
  return (
    <div className="w-full flex flex-col gap-4 ">
      <div className="">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={onSelect}
          className="w-full bg-transparent p-0"
        />
      </div>
      {showTime && (
        <div className="flex flex-col gap-6 border-t !pt-4">
          <div className="flex w-full flex-col gap-3">
            <Label htmlFor="time-from">Time</Label>
            <div className="relative flex w-full items-center gap-2">
              <TbClock className="text-muted-foreground pointer-events-none absolute left-2.5 size-4 select-none" />
              <Input
                id="time-from"
                type="time"
                step="1"
                defaultValue="10:30:00"
                className="appearance-none pl-8 [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
              />
            </div>
          </div>
          {/* <div className="flex w-full flex-col gap-3">
            <Label htmlFor="time-to">End Time</Label>
            <div className="relative flex w-full items-center gap-2">
              <TbClock className="text-muted-foreground pointer-events-none absolute left-2.5 size-4 select-none" />
              <Input
                id="time-to"
                type="time"
                step="1"
                defaultValue="12:30:00"
                className="appearance-none pl-8 [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
              />
            </div>
          </div> */}
        </div>
      )}
    </div>
  );
}

export default memo(DateField);
