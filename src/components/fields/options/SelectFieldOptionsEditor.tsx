import { getSelectChoices } from "@/../convex/config/fieldConfig";
import SelectOptionsEditor from "@/components/settings/templates/SelectOptionsEditor";
import type { FieldOptionsEditorProps } from "@/components/fields/fieldHostTypes";

// Adaptateur : SelectOptionsEditor a sa propre API (choices/isMulti), plus
// riche qu'un simple patch — on la branche ici sur le contrat générique du
// registry plutôt que de la réécrire.
export default function SelectFieldOptionsEditor({
  field,
  onChange,
}: FieldOptionsEditorProps) {
  return (
    <SelectOptionsEditor
      choices={getSelectChoices(field)}
      isMulti={field.options?.isMulti === true}
      onChange={(choices, isMulti) =>
        onChange({ options: { choices, isMulti: isMulti || undefined } })
      }
    />
  );
}
