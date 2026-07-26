import { cn } from "@/lib/utils";
import type { FieldViewProps } from "@/components/fields/fieldHostTypes";

// edit:"none" — purement indicatif. `false` rend un badge neutre "No"
// plutôt que rien : un champ vide et un champ explicitement faux ne doivent
// pas se ressembler (question laissée ouverte dans le plan, tranchée ici).
// Seule une value absente/non booléenne rend l'état vide.
export default function BooleanBadgeView({ value }: FieldViewProps) {
  if (typeof value !== "boolean") {
    return (
      <span className="text-sm text-muted-foreground/60 italic px-0.5">—</span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium",
        value
          ? "bg-green-100 text-green-800"
          : "bg-gray-100 text-gray-600",
      )}
    >
      {value ? "Yes" : "No"}
    </span>
  );
}
