import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/shadcn/toggle-group";
import { USAGE_PERIODS, type UsagePeriodValue } from "@/hooks/useAiUsage";

/**
 * Une seule rangée de filtre, au-dessus de tout ce qu'elle cadre : le total, le
 * graphe et le tableau se recalculent tous sur la même tranche. Pas de filtre
 * par carte.
 */
export default function AiUsagePeriodSelector({
  value,
  onChange,
}: {
  value: UsagePeriodValue;
  onChange: (value: UsagePeriodValue) => void;
}) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      value={value}
      // Radix émet "" quand on déselectionne l'item actif : on garde alors la
      // période courante plutôt que de vider la page.
      onValueChange={(next) => next && onChange(next as UsagePeriodValue)}
      aria-label="Usage period"
    >
      {USAGE_PERIODS.map((period) => (
        <ToggleGroupItem key={period.value} value={period.value}>
          {period.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
