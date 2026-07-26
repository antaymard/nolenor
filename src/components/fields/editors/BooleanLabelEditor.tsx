import { Checkbox } from "@/components/shadcn/checkbox";
import type { FieldEditorProps } from "@/components/fields/fieldHostTypes";

// Pendant éditable de BooleanCheckboxLabelView : le label fait partie de la
// zone cliquable (comportement attendu d'une case à cocher étiquetée).
export default function BooleanLabelEditor({
  field,
  value,
  showLabel,
  commit,
}: FieldEditorProps) {
  const checked = value === true;

  return (
    <label
      className="nodrag flex items-center gap-1.5 min-w-0 cursor-pointer"
      onClick={(e) => e.stopPropagation()}
    >
      <Checkbox
        className="block shrink-0"
        checked={checked}
        onCheckedChange={(next) => commit(next === true)}
      />
      {showLabel && (
        <span className="truncate text-sm select-none">{field.name}</span>
      )}
    </label>
  );
}
