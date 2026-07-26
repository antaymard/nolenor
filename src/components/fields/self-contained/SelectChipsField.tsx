import { useMemo, useState } from "react";
import { SelectCellEditor } from "@/components/table/SelectCellEditor";
import {
  SELECT_COLOR_CLASSES,
  type SelectColor,
  type SelectOption,
} from "@/components/table/types";
import { getSelectChoices } from "@/../convex/config/fieldConfig";
import { cn } from "@/lib/utils";
import type { FieldComponentProps } from "@/components/fields/fieldHostTypes";

function toSelectColor(color: string | undefined): SelectColor {
  return color && color in SELECT_COLOR_CLASSES
    ? (color as SelectColor)
    : "gray";
}

// "custom" (bypass des 4 shells) : SelectCellEditor gère déjà lui-même son
// propre popover (partagé avec les tables) — l'imbriquer dans PopoverShell
// doublerait les popovers plutôt que de les unifier. Reste un composant
// autonome, à la manière de l'ancien FieldRenderProps.
export default function SelectChipsField({
  field,
  value,
  onCommit,
}: FieldComponentProps) {
  const [editing, setEditing] = useState(false);

  const options: SelectOption[] = useMemo(
    () =>
      getSelectChoices(field).map((choice) => ({
        id: choice.id,
        label: choice.label,
        color: toSelectColor(choice.color),
      })),
    [field],
  );

  const ids = Array.isArray(value)
    ? value.filter((id): id is string => typeof id === "string")
    : [];

  return (
    <div className={cn("w-full min-w-0 text-sm", onCommit && "nodrag")}>
      <SelectCellEditor
        options={options}
        isMulti={field.options?.isMulti === true}
        value={ids}
        isEditing={editing}
        readOnly={!onCommit}
        onClick={() => onCommit && setEditing(true)}
        onChange={(next) => onCommit?.(next)}
        onBlur={() => setEditing(false)}
      />
    </div>
  );
}
