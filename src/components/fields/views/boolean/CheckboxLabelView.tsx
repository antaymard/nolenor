import { Checkbox } from "@/components/shadcn/checkbox";
import type { FieldViewProps } from "@/components/fields/fieldHostTypes";

// Variant `ownsLabel` : FieldHost ne rend PAS le label au-dessus, la vue
// l'affiche elle-même à côté de la case. `showLabel === false` ⇒ on rend
// exactement comme le variant `checkbox` (l'utilisateur a désactivé le
// label, changer de variant ne doit pas le ressusciter).
export default function BooleanCheckboxLabelView({
  field,
  value,
  showLabel,
}: FieldViewProps) {
  return (
    <span className="flex items-center gap-1.5 min-w-0">
      <Checkbox
        className="block shrink-0"
        checked={value === true}
        disabled
        onClick={(e) => e.stopPropagation()}
      />
      {showLabel && (
        <span className="truncate text-sm text-muted-foreground">
          {field.name}
        </span>
      )}
    </span>
  );
}
