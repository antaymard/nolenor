import { Checkbox } from "@/components/shadcn/checkbox";
import type { FieldEditorProps } from "@/components/fields/fieldHostTypes";

export default function BooleanEditor({ value, commit }: FieldEditorProps) {
  return (
    <Checkbox
      className="nodrag block"
      checked={value === true}
      onCheckedChange={(checked) => commit(checked === true)}
      onClick={(e) => e.stopPropagation()}
    />
  );
}
