import { cn } from "@/lib/utils";
import { numberUnit } from "@/components/fields/shared/numberFormat";
import type { FieldViewProps } from "@/components/fields/fieldHostTypes";

export default function NumberPlainView({ field, value }: FieldViewProps) {
  const num = typeof value === "number" ? value : undefined;
  const unit = numberUnit(field);

  return (
    <span
      className={cn(
        "block w-full min-w-0 truncate text-sm tabular-nums rounded px-0.5 py-0.5",
        num === undefined && "text-muted-foreground/60 italic",
      )}
    >
      {num !== undefined ? (unit ? `${num} ${unit}` : String(num)) : field.name}
    </span>
  );
}
