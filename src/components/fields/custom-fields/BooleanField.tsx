import { Checkbox } from "@/components/shadcn/checkbox";
import type { FieldRenderProps } from "@/components/fields/registry/fieldRegistry";

export default function BooleanField({ value, onCommit }: FieldRenderProps) {
  return (
    <Checkbox
      className="nodrag block"
      checked={value === true}
      disabled={!onCommit}
      onCheckedChange={(checked) => onCommit?.(checked === true)}
      onClick={(e) => e.stopPropagation()}
    />
  );
}
