import { cn } from "@/lib/utils";
import { shortTextPlaceholder } from "@/components/fields/shared/shortTextFormat";
import type { FieldViewProps } from "@/components/fields/fieldHostTypes";

export default function ShortTextPlainView({ field, value }: FieldViewProps) {
  const text = typeof value === "string" ? value : "";

  return (
    <span
      className={cn(
        "block w-full min-w-0 truncate text-sm rounded px-0.5 py-0.5",
        !text && "text-muted-foreground/60 italic",
      )}
    >
      {text || shortTextPlaceholder(field)}
    </span>
  );
}
