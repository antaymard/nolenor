import { cn } from "@/lib/utils";
import { numberUnit } from "@/components/fields/shared/numberFormat";
import type { FieldViewProps } from "@/components/fields/fieldHostTypes";

export default function NumberKpiView({ field, value, options }: FieldViewProps) {
  const num = typeof value === "number" ? value : undefined;
  // options est toujours complet ici (parseVariantOptions applique les
  // défauts du schéma) — pas de `?? true` défensif nécessaire.
  const showUnit = options?.showUnit === true;
  const unit = numberUnit(field);

  if (num === undefined) {
    return (
      <span className="block w-full min-w-0 truncate rounded px-0.5 py-0.5 text-2xl font-semibold text-muted-foreground/40 tabular-nums">
        —
      </span>
    );
  }

  return (
    <span
      className={cn(
        "flex w-full min-w-0 items-baseline gap-1 rounded px-0.5 py-0.5",
      )}
    >
      <span className="truncate text-2xl font-semibold leading-none tabular-nums">
        {num}
      </span>
      {showUnit && unit && (
        <span className="shrink-0 text-xs text-muted-foreground">{unit}</span>
      )}
    </span>
  );
}
