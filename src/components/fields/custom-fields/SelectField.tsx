import { useMemo, useState } from "react";
import { SelectCellEditor } from "@/components/table/SelectCellEditor";
import {
  SELECT_COLOR_CLASSES,
  type SelectColor,
  type SelectOption,
} from "@/components/table/types";
import { getSelectChoices } from "@/../convex/config/fieldConfig";
import type { FieldRenderProps } from "@/components/fields/registry/fieldRegistry";

function toSelectColor(color: string | undefined): SelectColor {
  return color && color in SELECT_COLOR_CLASSES
    ? (color as SelectColor)
    : "gray";
}

// Réutilise l'éditeur select des tables (chips colorées, popover avec
// recherche). Les values sont des tableaux d'ids d'options.
export default function SelectField({
  field,
  value,
  onCommit,
}: FieldRenderProps) {
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
    <div className="nodrag w-full min-w-0 text-sm">
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
