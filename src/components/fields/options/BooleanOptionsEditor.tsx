import { Checkbox } from "@/components/shadcn/checkbox";
import { Label } from "@/components/shadcn/label";
import type { FieldOptionsEditorProps } from "@/components/fields/fieldHostTypes";

export default function BooleanOptionsEditor({
  field,
  onChange,
}: FieldOptionsEditorProps) {
  return (
    <div className="flex items-center justify-between">
      <Label className="text-xs">Checked by default</Label>
      <Checkbox
        checked={field.default === true}
        onCheckedChange={(checked) =>
          onChange({ default: checked === true ? true : undefined })
        }
      />
    </div>
  );
}
