import { cn } from "@/lib/utils";
import { shortTextPlaceholder } from "@/components/fields/shared/shortTextFormat";
import type { FieldViewProps } from "@/components/fields/fieldHostTypes";

export default function ShortTextHeadingView({ field, value }: FieldViewProps) {
  const text = typeof value === "string" ? value : "";

  return (
    <span
      className={cn(
        "block w-full min-w-0 truncate rounded px-0.5 py-0.5",
        "text-base font-semibold leading-tight",
        !text && "text-muted-foreground/60 italic font-normal",
      )}
    >
      {text || shortTextPlaceholder(field)}
    </span>
  );
}
