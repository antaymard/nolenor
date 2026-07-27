import { Input } from "@/components/shadcn/input";
import { Label } from "@/components/shadcn/label";
import type { FieldOptionsEditorProps } from "@/components/fields/fieldHostTypes";

export default function ShortTextOptionsEditor({
  field,
  onChange,
}: FieldOptionsEditorProps) {
  return (
    <>
      <div className="space-y-1">
        <Label className="text-xs">Placeholder</Label>
        <Input
          value={
            typeof field.options?.placeholder === "string"
              ? field.options.placeholder
              : ""
          }
          onChange={(e) =>
            onChange({
              options: {
                ...field.options,
                placeholder: e.target.value || undefined,
              },
            })
          }
          placeholder={field.name}
          className="h-8"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Default value</Label>
        <Input
          value={typeof field.default === "string" ? field.default : ""}
          onChange={(e) => onChange({ default: e.target.value || undefined })}
          className="h-8"
        />
      </div>
    </>
  );
}
