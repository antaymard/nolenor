import { Checkbox } from "@/components/shadcn/checkbox";
import type { FieldViewProps } from "@/components/fields/fieldHostTypes";

export default function BooleanCheckboxView({ value }: FieldViewProps) {
  return (
    <Checkbox
      className="block"
      checked={value === true}
      disabled
      onClick={(e) => e.stopPropagation()}
    />
  );
}
